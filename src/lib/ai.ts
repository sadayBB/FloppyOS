import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { getFunctionAuth } from './sync';

/*
 * Claude integration. Two ways to hold the API key:
 *  - "supabase" (recommended): the key is a secret of the user's Supabase project; requests go through
 *    the claude-proxy Edge Function, which only accepts the owner's session. The key never touches a device.
 *  - "device": the key is kept in this browser's storage (never synced, never in the repo).
 * Nothing is sent to Anthropic unless the user presses a ✨ button, and every AI result is a
 * suggestion the user reviews before anything is saved (RF-112, RF-120).
 */

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
export const AI_MODELS: { id: AiModel; name: string; note: string }[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: 'El más capaz (recomendado)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: 'Rápido y más económico' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'El más barato, para tareas simples' },
];

const KEY = 'floppyos.ai';
export type AiConfig = { mode: 'supabase'; model: AiModel } | { mode: 'device'; apiKey: string; model: AiModel };

export function getAiConfig(): AiConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!c) return null;
    const model: AiModel = c.model ?? 'claude-opus-5-5';
    if (c.mode === 'supabase') return { mode: 'supabase', model };
    return c.apiKey ? { mode: 'device', apiKey: c.apiKey, model } : null;
  } catch {
    return null;
  }
}
export function setAiConfig(c: AiConfig | null) {
  if (c) localStorage.setItem(KEY, JSON.stringify(c));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('floppyos-ai'));
}
export const aiReady = () => !!getAiConfig();

export class AiError extends Error {}

async function client() {
  const cfg = getAiConfig();
  if (!cfg) throw new AiError('Configura la IA en Panel de control → IA.');
  if (!navigator.onLine) throw new AiError('La IA necesita internet. Todo lo demás sigue funcionando sin conexión.');
  if (cfg.mode === 'supabase') {
    const auth = await getFunctionAuth();
    if (!auth) throw new AiError('Inicia sesión en Sincronización para usar la IA guardada en Supabase.');
    // The SDK talks to the proxy; it sends our session as the bearer token and never sees the API key.
    return {
      c: new Anthropic({ apiKey: null, authToken: auth.token, baseURL: `${auth.url}/functions/v1/claude-proxy`, dangerouslyAllowBrowser: true, maxRetries: 2 }),
      model: cfg.model,
    };
  }
  return { c: new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }), model: cfg.model };
}

/** Server-side refusal fallback is supported on Opus/Sonnet 5.5, not on Haiku. */
const fallbackParams = (model: AiModel) =>
  model === 'claude-haiku-5-5' ? { betas: [] as string[] } : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

function explain(e: unknown): never {
  if (e instanceof AiError) throw e;
  if (e instanceof Anthropic.AuthenticationError) throw new AiError('No autorizado: revisa la clave de API (o, en modo Supabase, tu sesión y el secreto ANTHROPIC_API_KEY).');
  if (e instanceof Anthropic.PermissionDeniedError) throw new AiError(`Acceso denegado: ${e.message}`);
  if (e instanceof Anthropic.RateLimitError) throw new AiError('Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentar.');
  if (e instanceof Anthropic.BadRequestError) throw new AiError(`Solicitud rechazada: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) throw new AiError('No pude conectar con Claude. ¿Hay internet?');
  if (e instanceof Anthropic.APIError) throw new AiError(`Error de la API (${e.status}): ${e.message}`);
  throw new AiError((e as Error)?.message ?? 'Error desconocido');
}

const BASE_SYSTEM =
  'Eres el asistente de FloppyOS, la app de organización universitaria de una estudiante. Responde siempre en español, ' +
  'de forma breve y amable. Usa solo la información que se te da: si algo no está en los datos, dilo en vez de suponerlo. ' +
  'Nunca inventes libros, autores, fechas ni calificaciones.';

/** Structured call: returns data validated against the Zod schema. */
export async function askJSON<S extends z.ZodType>(schema: S, task: string, input: string, effort: 'low' | 'medium' | 'high' = 'low'): Promise<z.infer<S>> {
  const { c, model } = await client();
  try {
    const res = await c.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: `${BASE_SYSTEM}\n\n${task}`,
      messages: [{ role: 'user', content: input }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
      ...fallbackParams(model),
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude prefirió no responder a esta solicitud.');
    if (res.stop_reason === 'max_tokens') throw new AiError('La respuesta quedó incompleta (texto demasiado largo). Prueba con menos contenido.');
    if (res.parsed_output == null) throw new AiError('La respuesta no tuvo el formato esperado. Intenta de nuevo.');
    return res.parsed_output as z.infer<S>;
  } catch (e) {
    explain(e);
  }
}

/** Free-text call (summaries, answers). History alternates user/assistant. */
export async function askText(task: string, messages: { role: 'user' | 'assistant'; content: string }[], effort: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
  const { c, model } = await client();
  try {
    const res = await c.beta.messages
      .stream({
        model,
        max_tokens: 16000,
        system: `${BASE_SYSTEM}\n\n${task}`,
        messages,
        output_config: { effort },
        ...fallbackParams(model),
      })
      .finalMessage();
    if (res.stop_reason === 'refusal') throw new AiError('Claude prefirió no responder a esta solicitud.');
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  } catch (e) {
    explain(e);
  }
}

export async function testAi(): Promise<string> {
  const r = await askText('Responde con una sola frase corta.', [{ role: 'user', content: 'Saluda a la estudiante con un «miau».' }], 'low');
  return r || 'Conectado.';
}
