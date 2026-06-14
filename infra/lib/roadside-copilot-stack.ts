import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface RoadsideCopilotStackProps extends cdk.StackProps {
  /** Origin allowed to call the API (the GitHub Pages site), or '*' for the prototype. */
  readonly allowedOrigin: string;
}

/**
 * The Roadside Co-Pilot backend: a single HTTP API fronting per-route Lambdas.
 * Routes are added with `addRoute`; every Lambda gets read access to the API-key
 * secret and read/write access to the claims table, plus a shared bundling config.
 */
export class RoadsideCopilotStack extends cdk.Stack {
  private readonly httpApi: HttpApi;
  private readonly secret: secretsmanager.Secret;
  private readonly table: dynamodb.Table;
  private readonly allowedOrigin: string;

  constructor(scope: Construct, id: string, props: RoadsideCopilotStackProps) {
    super(scope, id, props);
    this.allowedOrigin = props.allowedOrigin;

    // Claims + audit events. PK = claimId, SK = recordType ("claim" | "event#<ts>").
    this.table = new dynamodb.Table(this, 'ClaimsTable', {
      partitionKey: { name: 'claimId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // prototype: tear down cleanly
    });

    // Holds OPENAI_API_KEY (mint Realtime tokens) and ANTHROPIC_API_KEY (Opus).
    // Created with placeholders; set real values after deploy:
    //   aws secretsmanager put-secret-value --secret-id <arn> \
    //     --secret-string '{"OPENAI_API_KEY":"sk-...","ANTHROPIC_API_KEY":"sk-ant-..."}'
    this.secret = new secretsmanager.Secret(this, 'ApiKeys', {
      secretName: 'roadside-copilot/api-keys',
      description: 'OpenAI + Anthropic API keys for the Roadside Co-Pilot',
      secretObjectValue: {
        OPENAI_API_KEY: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
        ANTHROPIC_API_KEY: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
      },
    });

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'roadside-copilot',
      corsPreflight: {
        allowOrigins: [this.allowedOrigin],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Baseline route to confirm the stack deploys and CORS works end-to-end.
    this.addRoute(HttpMethod.GET, '/health', 'health');

    // Mint OpenAI Realtime ephemeral tokens for the browser voice session.
    this.addRoute(HttpMethod.POST, '/session', 'session');

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'SecretArn', { value: this.secret.secretArn });
    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
  }

  /** Create a Lambda from `lambda/<name>.ts` and wire it to `METHOD path`. */
  private addRoute(method: HttpMethod, route: string, name: string, extraEnv: Record<string, string> = {}) {
    const fn = new lambdaNode.NodejsFunction(this, `Fn-${name}`, {
      entry: path.join(__dirname, '..', 'lambda', `${name}.ts`),
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: new logs.LogGroup(this, `Logs-${name}`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        SECRET_ARN: this.secret.secretArn,
        TABLE_NAME: this.table.tableName,
        ALLOWED_ORIGIN: this.allowedOrigin,
        ...extraEnv,
      },
      bundling: {
        // AWS SDK v3 is provided by the Node 20 runtime; markdown policy docs
        // are bundled as strings so the coverage check can cite them.
        externalModules: ['@aws-sdk/*'],
        loader: { '.md': 'text' },
        format: lambdaNode.OutputFormat.ESM,
        target: 'node20',
      },
    });

    this.secret.grantRead(fn);
    this.table.grantReadWriteData(fn);

    this.httpApi.addRoutes({
      path: route,
      methods: [method],
      integration: new HttpLambdaIntegration(`Int-${name}`, fn),
    });

    return fn;
  }
}
