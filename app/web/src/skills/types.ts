// A skill is a preset a business user picks instead of writing a prompt: a short system prompt, a JSON Schema the
// engine constrains its output to, and a renderer that shows the result as a form, a card or a table.
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { SkillRunRecord } from '../utils/types';

export type SkillInput = Record<string, unknown>;

export interface SkillOption {
  key: string;
  label: string;
  type: 'number';
  min: number;
  max: number;
  default: number;
}

export interface SkillRenderProps<T> {
  /** the parsed result; partial while it streams */
  object: T | undefined;
  streaming: boolean;
  /** the text the person gave the skill */
  input: string;
  skillInput?: SkillInput;
  run: SkillRunRecord;
}

export interface Skill<T = unknown> {
  id: string;
  name: string;
  /** one sentence: what it does for the person */
  purpose: string;
  /** label inside the composer field */
  inputLabel: string;
  placeholder: string;
  /** a realistic sample to try it on (fictional) */
  example: string;
  /** false when the skill can run without any text (Synthetic claims) */
  requiresText: boolean;
  options?: SkillOption[];
  systemPrompt: string;
  temperature: number;
  schema(input?: SkillInput): z.ZodType<T>;
  buildPrompt(text: string, input?: SkillInput): string;
  maxTokens(input?: SkillInput): number;
  Render: ComponentType<SkillRenderProps<T>>;
  /** remove data that must live in memory only, before the record is written to storage (`input` is the user's text) */
  forStorage?(run: SkillRunRecord, input: string): SkillRunRecord;
}
