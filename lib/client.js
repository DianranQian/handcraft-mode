window.__ModuleLoader__.load({
	id: "handcraft-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/HandcraftSection.tsx
		/**
		* 手搓模式设置分区组件（settings.section 槽，仿 dsh-pet 的 PetSettingsSection）：
		* 设置面板导航出现「手搓模式」分区，内部是总开关 + 六个能力开关。
		* 开关即写即生效（applies: live），无需保存按钮。
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
			},
			{
				key: "codeSnippets",
				label: "代码演示（默认开）",
				hint: "允许 AI 给完整可运行代码 + 讲解"
			},
			{
				key: "ecoMode",
				label: "省电模式（默认关）",
				hint: "回答精简，降低 token 费用"
			}
		];
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 10,
			padding: "6px 0"
		};
		const hintStyle = {
			opacity: .55,
			fontSize: 12
		};
		/**
		* 渲染手搓模式设置分区。
		* @param props - 组合槽 props（useHandcraft 来自 injected hooks）。
		*/
		function HandcraftSection({ t, useHandcraft, load, set }) {
			const state = useHandcraft((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			if (state.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				children: t("unavailable")
			});
			const busy = state.status !== "ready";
			const value = state.value;
			const disabled = busy || !state.writable || value === null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: { opacity: .75 },
					children: t("description")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					style: {
						...rowStyle,
						fontWeight: 600
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: value?.enabled ?? true,
						disabled,
						onChange: (event) => {
							set("enabled", event.target.checked);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("master") })]
				}),
				(value?.enabled ?? true) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						paddingLeft: 12,
						opacity: disabled ? .6 : 1
					},
					children: TOGGLES.map(({ key, label, hint }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: rowStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: value ? Boolean(value[key]) : false,
								disabled,
								onChange: (event) => {
									set(key, event.target.checked);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { whiteSpace: "nowrap" },
								children: label
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: hintStyle,
								children: hint
							})
						]
					}, key))
				}),
				state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					style: { color: "var(--danger, #c0392b)" },
					children: state.error
				}),
				busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: { opacity: .5 },
					children: t("loading")
				})
			] });
		}
		//#endregion
		//#region src/client/settings-store.ts
		/** 与 host 半 NAMESPACE 一致的 settings namespace。 */
		const HANDCRAFT_SETTINGS_NS = "handcraft-mode";
		/** 与 host schema 一致的默认值（旧文档缺字段时补齐）。 */
		const DEFAULTS = {
			enabled: true,
			readTools: true,
			visionTools: false,
			searchTools: true,
			askTools: true,
			writeTools: false,
			memoryTools: false,
			codeSnippets: true,
			ecoMode: false,
			injectPrompt: true
		};
		/** 控制器：把 settingsScope 的 snapshot 投影为分区渲染快照。 */
		var HandcraftSettingsController = class {
			scope;
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "loading",
				error: null,
				writable: false,
				value: null
			});
			unsubscribe;
			constructor(scope) {
				this.scope = scope;
				this.publish();
				this.unsubscribe = this.scope.subscribe(() => this.publish());
			}
			/** 拉取一次 host 描述（首次渲染时调用）。 */
			load = () => this.scope.load();
			/** 写一个字段（开关即时生效，applies: live）。 */
			set = (field, value) => this.scope.set(field, value);
			/** 停止订阅（分区卸载时由注册侧调用）。 */
			dispose() {
				this.unsubscribe();
			}
			publish() {
				const snapshot = this.scope.getSnapshot();
				if (snapshot.status === "ready") this.store.update((state) => {
					state.status = "ready";
					state.error = null;
					state.writable = snapshot.writable;
					state.value = {
						...DEFAULTS,
						...snapshot.value
					};
				});
				else if (snapshot.status === "unavailable") this.store.update((state) => {
					state.status = "unavailable";
					state.error = null;
					state.writable = false;
					state.value = null;
				});
				else this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
			}
		};
		//#endregion
		//#region src/client/index.ts
		/** 需要的服务（cordis fiber inject；settingsScope 由 ui-settings 提供）。 */
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		const LOCALE_NS = "settings.handcraft";
		const zh = {
			"settings.title": "手搓模式",
			"settings.description": "AI 只能动嘴不能动手：禁命令、禁写文件，只给关键代码片段。勾选允许的能力。",
			"settings.master": "启用（总开关）",
			"settings.loading": "加载中…",
			"settings.unavailable": "当前部署未暴露本插件的设置命名空间，表单不可用。"
		};
		const en = {
			"settings.title": "Handcraft Mode",
			"settings.description": "AI talks only: no commands, no file writes, snippets only. Tick the capabilities it may use.",
			"settings.master": "Enabled",
			"settings.loading": "Loading…",
			"settings.unavailable": "This deployment does not expose the plugin's settings namespace."
		};
		/**
		* 浏览器插件主体：注册设置面板分区。
		* @param ctx - client root context。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "handcraft: section dictionaries");
			ctx.slots.inject("settings.section", () => {
				const controller = new HandcraftSettingsController(ctx.settingsScope.bind({ namespace: HANDCRAFT_SETTINGS_NS }));
				const unregister = ctx.slots.register({
					name: "settings.section",
					id: "handcraft",
					order: 130,
					label: () => ctx.locale.bind(LOCALE_NS)("settings.title"),
					locale: LOCALE_NS,
					inject: () => ({
						hooks: { handcraft: controller.store },
						load: () => controller.load(),
						set: (field, value) => controller.set(field, value)
					})
				}, HandcraftSection);
				return () => {
					controller.dispose();
					unregister();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map