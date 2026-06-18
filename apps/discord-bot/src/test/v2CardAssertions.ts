import { MessageFlags } from 'discord.js';
import { expect } from 'vitest';

export function expectV2Card(payload: unknown): void {
  expect(payload).toEqual(expect.objectContaining({
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: expect.anything(),
  }));
  expect(hasOwn(payload, 'content')).toBe(false);
  expect(hasOwn(payload, 'embeds')).toBe(false);
}

export function cardText(payload: unknown): string {
  const texts: string[] = [];
  for (const component of readComponents(payload)) {
    walk(component.toJSON(), texts);
  }
  return texts.join('\n');
}

export function cardJson(payload: unknown): string {
  return JSON.stringify(readComponents(payload).map((component) => component.toJSON()));
}

function readComponents(payload: unknown): Array<{ toJSON: () => unknown }> {
  if (!payload || typeof payload !== 'object' || !('components' in payload)) return [];

  const components = payload.components;
  if (!Array.isArray(components)) return [];

  return components.filter((component): component is { toJSON: () => unknown } => (
    Boolean(component) && typeof component === 'object' && 'toJSON' in component && typeof component.toJSON === 'function'
  ));
}

function walk(node: unknown, texts: string[]): void {
  if (!node || typeof node !== 'object') return;

  const record = node as { type?: number; content?: unknown; components?: unknown };
  if (record.type === 10 && typeof record.content === 'string') {
    texts.push(record.content);
  }
  if (Array.isArray(record.components)) {
    record.components.forEach((child) => walk(child, texts));
  }
}

function hasOwn(value: unknown, property: string): boolean {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, property));
}
