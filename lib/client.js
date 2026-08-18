window.__ModuleLoader__.load({
	id: "handcraft-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/HandcraftRow.tsx
		/**
		* 手搓模式设置行（settings.general.item 槽）：
		* 总开关 + 三个能力细分开关（读文件 / 搜索网络 / 提问）。
		* 读写 host settings namespace 'handcraft-mode'，改动即时生效（applies: live）。
		*/
		const TOGGLES = [
			{
				key: "readTools",
				label: "读文件",
				hint: "read / read_image / glob / grep"
			},
			{
				key: "visionTools",
				label: "看图（默认关）",
				hint: "describe_image / modlens_read_image"
			},
			{
				key: "searchTools",
				label: "搜索与网络",
				hint: "web_search + MCP 搜索工具"
			},
			{
				key: "askTools",
				label: "提问",
				hint: "ask_user_question"
			},
			{
				key: "writeTools",
				label: "写文件（默认关）",
				hint: "write / edit / str_replace_editor"
			},
			{
				key: "memoryTools",
				label: "记忆与待办（默认关）",
				hint: "memory / dtodo / 目标管理"
			}
		];
		/** 行内小开关（原生 checkbox，避免额外组件依赖）。 */
		function Toggle(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "2px 0",
					cursor: props.disabled ? "default" : "pointer"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: props.checked,
						disabled: props.disabled,
						onChange: (event) => props.onChange(event.target.checked)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: { whiteSpace: "nowrap" },
						children: props.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							opacity: .55,
							fontSize: 12,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: props.hint
					})
				]
			});
		}
		/**
		* 渲染手搓模式设置行。
		* @param props - 组合槽 props（useHandcraft 来自 injected hooks）。
		*/
		function HandcraftRow({ load, set, useHandcraft, t }) {
			const state = useHandcraft((snapshot) => snapshot);
			const [dirty, setDirty] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				if (state.status === "ready" || state.status === "error") setDirty(false);
			}, [state.status]);
			if (state.status === "unavailable") return null;
			const busy = state.status === "loading" || state.status === "saving";
			const value = state.value;
			const disabled = busy || !state.writable || value === null;
			const description = state.error ?? t("description");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					padding: "6px 0"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 2
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { fontWeight: 600 },
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: state.error === null ? void 0 : "alert",
								style: {
									opacity: state.error === null ? .7 : 1,
									fontSize: 12
								},
								children: description
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								cursor: disabled ? "default" : "pointer",
								whiteSpace: "nowrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: value?.enabled ?? true,
								disabled,
								onChange: (event) => {
									setDirty(true);
									set({ enabled: event.target.checked });
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { fontWeight: 600 },
								children: t("master")
							})]
						})]
					}),
					(value?.enabled ?? true) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 2,
							paddingLeft: 8,
							opacity: disabled ? .6 : 1
						},
						children: TOGGLES.map(({ key, label, hint }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							checked: value[key],
							disabled,
							label,
							hint,
							onChange: (next) => {
								setDirty(true);
								set({ [key]: next });
							}
						}, key))
					}),
					dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							opacity: .6
						},
						children: t("saving")
					})
				]
			});
		}
		//#endregion
		//#region src/client/settings-store.ts
		/** 与 host 半 NAMESPACE 一致的 settings namespace。 */
		const HANDCRAFT_SETTINGS_NS = "handcraft-mode";
		/** 从 host 描述符解析当前值（缺字段时用默认；新能力默认关）。 */
		function valueOf(view) {
			const raw = view.value ?? {};
			return {
				enabled: raw.enabled ?? true,
				readTools: raw.readTools ?? true,
				visionTools: raw.visionTools ?? false,
				searchTools: raw.searchTools ?? true,
				askTools: raw.askTools ?? true,
				writeTools: raw.writeTools ?? false,
				memoryTools: raw.memoryTools ?? false,
				injectPrompt: raw.injectPrompt ?? true
			};
		}
		/** 控制器：连接设置读、写与推送失效。 */
		var HandcraftSettingsController = class {
			api;
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "idle",
				error: null,
				writable: false,
				value: null,
				revision: 0
			});
			generation = 0;
			view;
			constructor(api) {
				this.api = api;
			}
			/** 刷新描述符；最新请求胜出。 */
			async load() {
				const generation = ++this.generation;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const response = await this.api.settings.describe({});
					if (!response.result.ok) throw new Error(response.result.error.message);
					if (generation !== this.generation) return;
					const view = response.result.value.namespaces.find((entry) => entry.ns === HANDCRAFT_SETTINGS_NS);
					if (view === void 0) {
						this.view = void 0;
						this.store.update((state) => {
							state.status = "unavailable";
							state.writable = false;
							state.value = null;
						});
						return;
					}
					this.accept(view, response.result.value.writable);
				} catch (error) {
					if (generation !== this.generation) return;
					this.fail(error);
				}
			}
			/** 持久化一个补丁（只写用户改过的字段）。 */
			async set(patch) {
				const view = this.view;
				const state = this.store.getSnapshot();
				if (view === void 0 || !state.writable || state.value === null) return;
				const generation = ++this.generation;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const ops = Object.entries(patch).map(([key, value]) => ({
						op: "set",
						path: [key],
						value
					}));
					const response = await this.api.settings.mutate({
						ns: HANDCRAFT_SETTINGS_NS,
						ops,
						expectedRevision: view.revision
					});
					if (generation !== this.generation) return;
					if (!response.result.ok) throw new Error(response.result.error.message);
					this.accept(response.result.value, true);
				} catch (error) {
					if (generation !== this.generation) return;
					this.fail(error);
				}
			}
			dispose() {
				this.generation += 1;
				this.view = void 0;
			}
			accept(view, writable) {
				this.view = view;
				this.store.update((state) => {
					state.status = "ready";
					state.error = null;
					state.writable = writable;
					state.value = valueOf(view);
					state.revision = view.revision;
				});
			}
			fail(error) {
				this.store.update((state) => {
					state.status = "error";
					state.error = error instanceof Error ? error.message : String(error);
				});
			}
		};
		//#endregion
		//#region src/client/index.ts
		/** 需要的服务（cordis fiber inject）。 */
		const inject = [
			"connection",
			"slots",
			"locale",
			"remote"
		];
		const LOCALE_NS = "settings.handcraft";
		const zh = {
			title: "手搓模式",
			master: "启用",
			description: "AI 只能动嘴不能动手：禁命令、禁写文件，只给关键代码片段。可勾选允许的能力。",
			saving: "保存中…"
		};
		const en = {
			title: "Handcraft Mode",
			master: "Enabled",
			description: "AI talks only: no commands, no file writes, snippets only. Tick the capabilities it may use.",
			saving: "Saving…"
		};
		/**
		* 浏览器插件主体：注册设置面板行。
		* @param ctx - client root context。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "handcraft: settings row dictionaries");
			const controller = new HandcraftSettingsController(ctx.get("connection").api);
			const injected = () => ({
				hooks: { handcraft: controller.store },
				load: () => controller.load(),
				set: (patch) => controller.set(patch)
			});
			ctx.effect(() => {
				const disposers = [ctx.remote.$on("settings/document-updated", () => {
					if (controller.store.getSnapshot().status === "idle") return;
					controller.load();
				}), ctx.on("connection/reset", () => {
					if (controller.store.getSnapshot().status === "idle") return;
					controller.load();
				})];
				return () => {
					controller.dispose();
					for (const dispose of disposers) dispose();
				};
			}, "handcraft: settings invalidations");
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "handcraft",
				order: -15,
				locale: LOCALE_NS,
				inject: injected
			}, HandcraftRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map