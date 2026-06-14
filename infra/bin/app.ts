#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { RoadsideCopilotStack } from '../lib/roadside-copilot-stack';

const app = new cdk.App();

// Origin allowed to call the API (the GitHub Pages site). Override at deploy time:
//   cdk deploy -c allowedOrigin=https://carlosrymer.github.io
const allowedOrigin = app.node.tryGetContext('allowedOrigin') ?? '*';

new RoadsideCopilotStack(app, 'RoadsideCopilotStack', {
  allowedOrigin,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Roadside Co-Pilot API: voice-session tokens, coverage checks, next-best-action, notifications',
});
