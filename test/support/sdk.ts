import { AssertionError } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxProvider,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type FauxResponseStep,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createEventBus,
  DefaultResourceLoader,
  initTheme,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import modelRoles from "../../src/extension.js";
import { fakeUI } from "./fake-ui.js";
export async function sdkHarness(
  options: {
    extensions?: InlineExtension[];
    roleExtension?: InlineExtension | false;
    mode?: "tui" | "json" | "rpc" | "print";
    child?: boolean;
    tools?: string[];
    /** Load only synthetic skills provisioned under the isolated fixture directory. */
    skills?: boolean;
    /** Load only synthetic prompt templates provisioned under the isolated fixture directory. */
    prompts?: boolean;
    prepare?: (dir: string, faux: FauxProviderHandle) => Promise<void>;
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "roles-sdk-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  const previousChild = process.env.PI_SUBAGENT_CHILD;
  process.env.PI_CODING_AGENT_DIR = dir;
  if (options.child) process.env.PI_SUBAGENT_CHILD = "1";
  else delete process.env.PI_SUBAGENT_CHILD;
  const faux = fauxProvider({
    provider: "fixture",
    tokensPerSecond: 1000000,
    models: [
      { id: "default", reasoning: true, input: ["text", "image"], contextWindow: 200000 },
      { id: "owner/fast", reasoning: true, input: ["text", "image"], contextWindow: 100000 },
    ],
  });
  await options.prepare?.(dir, faux);
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    refreshOnCreate: false,
  });
  runtime.registerNativeProvider(faux.provider);
  await runtime.refresh({ allowNetwork: false, providers: ["fixture"] });
  initTheme("dark", false);
  const bus = createEventBus();
  const ui = fakeUI();
  let context: ExtensionContext | undefined;
  const errors: string[] = [];
  const providerAssertions: AssertionError[] = [];
  const settings = SettingsManager.inMemory(
    {
      defaultProvider: "fixture",
      defaultModel: "default",
      defaultThinkingLevel: "high",
      compaction: { enabled: false },
      retry: { enabled: false },
    },
    { projectTrusted: false },
  );
  const loader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    settingsManager: settings,
    eventBus: bus,
    noExtensions: true,
    noSkills: !options.skills,
    noThemes: true,
    noPromptTemplates: !options.prompts,
    noContextFiles: true,
    extensionFactories: [
      ...(options.roleExtension === false ? [] : [options.roleExtension ?? modelRoles]),
      ...(options.extensions ?? []),
      (pi) => {
        pi.on("session_start", (_event, ctx) => {
          context = ctx;
        });
      },
    ],
    systemPrompt: "Synthetic fixture. No tools.",
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    modelRuntime: runtime,
    model: faux.models[0],
    thinkingLevel: "high",
    settingsManager: settings,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(dir),
    ...(options.tools === undefined ? {} : { tools: options.tools }),
  });
  await session.bindExtensions({
    mode: options.mode ?? "tui",
    uiContext: ui.ui,
    onError: (error) => errors.push(error.error),
  });
  return {
    dir,
    faux,
    runtime,
    bus,
    ui,
    session,
    settings,
    errors,
    get context() {
      if (!context) throw new Error("No context");
      return context;
    },
    respond(...responses: FauxResponseStep[]) {
      // Faux turns callback exceptions into assistant errors. Retain assertion
      // failures and rethrow outside the provider during cleanup so tests cannot
      // pass on call counts/session display while dispatch assertions failed.
      faux.setResponses(
        responses.map((step) =>
          typeof step !== "function"
            ? step
            : async (...args) => {
                try {
                  return await step(...args);
                } catch (error) {
                  if (error instanceof AssertionError) providerAssertions.push(error);
                  throw error;
                }
              },
        ),
      );
    },
    async close() {
      try {
        await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
        session.dispose();
      } finally {
        if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = previous;
        if (previousChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
        else process.env.PI_SUBAGENT_CHILD = previousChild;
        await rm(dir, { recursive: true, force: true });
      }
      if (providerAssertions.length) throw providerAssertions[0];
    },
  };
}
