import type { Skill } from './types';
import { claimFieldsSkill } from './claim-fields';
import { anonymiseSkill } from './anonymise';
import { triageSkill } from './triage';
import { syntheticSkill } from './synthetic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SKILLS: Skill<any>[] = [claimFieldsSkill, anonymiseSkill, triageSkill, syntheticSkill];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSkill = (id?: string | null): Skill<any> | undefined =>
  id ? SKILLS.find((s) => s.id === id) : undefined;

export type { Skill, SkillInput, SkillOption, SkillRenderProps } from './types';
