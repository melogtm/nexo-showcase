import type { RuleFn } from "./core";
import { art15v1 } from "./ec103-art15.v1";
import { art16v1 } from "./ec103-art16.v1";
import { art17v1 } from "./ec103-art17.v1";
import { art17v2 } from "./ec103-art17.v2";
import { art19v1 } from "./ec103-art19.v1";
import { art20v1 } from "./ec103-art20.v1";

export const ruleKey = (ruleCode: string, logicVersion: number) => `${ruleCode}@${logicVersion}`;

/** (rule_code, logic_version) → implementation. Entries are only ever added. */
export const RULES: Record<string, RuleFn> = {
  "EC103_ART15_PONTOS@1": art15v1 as RuleFn,
  "EC103_ART16_IDADE_PROGRESSIVA@1": art16v1 as RuleFn,
  "EC103_ART17_PEDAGIO_50@1": art17v1 as RuleFn,
  "EC103_ART17_PEDAGIO_50@2": art17v2 as RuleFn,
  "EC103_ART19_PERMANENTE@1": art19v1 as RuleFn,
  "EC103_ART20_PEDAGIO_100@1": art20v1 as RuleFn,
};
