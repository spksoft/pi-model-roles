import { defaultConfig } from "../../src/core/defaults.js";
import type {
  AvailableModel,
  RoleConfig,
  SelectionDependencies,
  SelectionRequest,
} from "../../src/core/types.js";
export const BASE = { provider: "fixture", id: "default" };
export const FAST = { provider: "fixture", id: "owner/fast" };
export const MODELS: AvailableModel[] = [BASE, FAST].map((ref) => ({
  ref,
  efforts: ["off", "low", "high"],
  images: true,
  contextWindow: 200000,
}));
export function config(): RoleConfig {
  return {
    ...defaultConfig(),
    roles: {
      default: { model: "inherit", effort: "inherit" },
      fast: { description: "Clear, mechanical tasks", model: FAST, effort: "low" },
    },
  };
}
export function request(overrides: Partial<SelectionRequest> = {}): SelectionRequest {
  return {
    task: "Rename the given identifier",
    baseline: { model: BASE, effort: "high" },
    current: { model: BASE, effort: "high" },
    ...overrides,
  };
}
export function dependencies(text = '{"matches":["fast"]}'): SelectionDependencies {
  return { config: config(), models: () => MODELS, classify: async () => ({ text }) };
}
