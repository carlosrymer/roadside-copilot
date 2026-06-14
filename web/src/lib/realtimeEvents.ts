import { useStore } from '../state/store';
import { executeTool } from './toolHandlers';
import type { Speaker } from '../types';

interface FunctionCallItem {
  type: string;
  name: string;
  call_id: string;
  arguments: string;
}

export interface EventHandlerDeps {
  /** Send a client event over the data channel (tool outputs, response.create). */
  send: (event: unknown) => void;
}

/**
 * Builds a handler for OpenAI Realtime server events: it streams agent and
 * customer transcripts into the store and dispatches the agent's function calls.
 * Stateful (accumulates streaming deltas), so create one per session.
 */
export function createServerEventHandler({ send }: EventHandlerDeps) {
  const agentBuf = new Map<string, string>();
  const customerBuf = new Map<string, string>();
  const handledCalls = new Set<string>();

  const upsert = (id: string, speaker: Speaker, text: string, final: boolean) => {
    useStore.getState().upsertTranscript({ id: `${speaker}:${id}`, speaker, text, final });
  };

  const sendToolOutput = (callId: string, output: unknown) => {
    send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    send({ type: 'response.create' });
  };

  const runToolCall = async (item: FunctionCallItem) => {
    let args: Record<string, unknown> = {};
    try {
      args = item.arguments ? JSON.parse(item.arguments) : {};
    } catch {
      /* leave empty */
    }
    const result = await executeTool(item.name, args);
    sendToolOutput(item.call_id, result);
  };

  return async (event: any): Promise<void> => {
    switch (event?.type) {
      // Agent speech transcript (streamed).
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta': {
        const id = event.item_id as string;
        agentBuf.set(id, (agentBuf.get(id) ?? '') + (event.delta ?? ''));
        upsert(id, 'agent', agentBuf.get(id)!, false);
        break;
      }
      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done': {
        const id = event.item_id as string;
        upsert(id, 'agent', event.transcript ?? agentBuf.get(id) ?? '', true);
        agentBuf.delete(id);
        break;
      }

      // Customer speech transcript (streamed input transcription).
      case 'conversation.item.input_audio_transcription.delta': {
        const id = event.item_id as string;
        customerBuf.set(id, (customerBuf.get(id) ?? '') + (event.delta ?? ''));
        upsert(id, 'customer', customerBuf.get(id)!, false);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const id = event.item_id as string;
        upsert(id, 'customer', event.transcript ?? customerBuf.get(id) ?? '', true);
        customerBuf.delete(id);
        break;
      }

      // Tool calls arrive in the completed response output.
      case 'response.done': {
        const outputs: FunctionCallItem[] = event.response?.output ?? [];
        for (const item of outputs) {
          if (item.type === 'function_call' && !handledCalls.has(item.call_id)) {
            handledCalls.add(item.call_id);
            await runToolCall(item);
          }
        }
        break;
      }

      case 'error': {
        useStore.getState().logEvent('warning', event.error?.message ?? 'Realtime error');
        break;
      }
    }
  };
}
