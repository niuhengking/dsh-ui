/**
 * DeepSeek account dashboard — browser widget for the dsh web GUI.
 * Floating button (bottom-right) + panel with account balance and a token
 * usage line chart across time ranges. Data comes from the host plugin's
 * loopback routes (/deepseek-account/status, /deepseek-account/usage); the
 * API key never leaves the host.
 *
 * Hand-written browser bundle in the tsdown artifact shape:
 * window.__ModuleLoader__.load({ id, factory }) where factory(require)
 * returns module.exports = { inject, apply }.
 */
window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-client-ui-deepseek-account",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var react = require("react");
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;

		var RANGES = [
			["today", "今天"],
			["3d", "近3天"],
			["7d", "近7天"],
			["30d", "近30天"],
			["365d", "近1年"],
			["total", "总共"]
		];
		var REFRESH_MS = 30000;
		var LOW_BALANCE_WARN = 10; // CNY
		var LOW_BALANCE_DANGER = 1; // CNY

		var CSS = `
.dsacc-root{position:fixed;right:20px;bottom:20px;z-index:2147482000;pointer-events:auto;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:inherit}
.dsacc-fab{position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border:none;border-radius:50%;background:linear-gradient(135deg,#4d6bfe,#5a8dff);box-shadow:0 6px 18px rgba(77,107,254,.35);cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;padding:0}
.dsacc-fab:hover{transform:scale(1.08)}
.dsacc-fab:active{transform:scale(.94)}
.dsacc-fab-ico{font-size:24px;line-height:1;animation:dsaccPulse 3s ease-in-out infinite}
@keyframes dsaccPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.dsacc-chip{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:700;color:#fff;background:rgba(30,41,59,.82);padding:3px 9px;border-radius:999px;pointer-events:none}
.dsacc-chip.danger{background:rgba(224,49,49,.92)}
.dsacc-chip.warn{background:rgba(230,126,34,.92)}
.dsacc-panel{position:absolute;right:0;bottom:68px;width:340px;max-height:calc(100vh - 140px);overflow-y:auto;padding:14px 16px 14px;border-radius:16px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));background:var(--dsw-alias-bg-layer-1,rgba(20,24,36,.94));box-shadow:0 12px 32px rgba(0,0,0,.38);box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
.dsacc-head{display:flex;align-items:center;gap:8px;width:100%}
.dsacc-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f4f8);letter-spacing:.4px}
.dsacc-badge{margin-left:auto;font-size:11px;font-weight:600;color:var(--dsw-alias-brand-primary,#8ea2ff);background:rgba(77,107,254,.16);padding:3px 9px;border-radius:999px;white-space:nowrap}
.dsacc-badge.bad{color:#ff8f8f;background:rgba(224,49,49,.16)}
.dsacc-close{margin-left:2px;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9aa4b2);font-size:14px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:6px}
.dsacc-close:hover{background:rgba(127,127,127,.16)}
.dsacc-sec{display:flex;flex-direction:column;gap:8px}
.dsacc-sec-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#9aa4b2);letter-spacing:.5px}
.dsacc-bal{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.07)}
.dsacc-bal-row{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--dsw-alias-label-primary,#f2f4f8)}
.dsacc-bal-row .k{color:var(--dsw-alias-label-secondary,#9aa4b2)}
.dsacc-bal-row .v{font-weight:700;font-variant-numeric:tabular-nums}
.dsacc-bal-row .v.hero{font-size:18px}
.dsacc-warn{font-size:12px;font-weight:600;padding:6px 10px;border-radius:10px;line-height:1.5}
.dsacc-warn.warn{color:#ffd28f;background:rgba(230,126,34,.14)}
.dsacc-warn.danger{color:#ff9a9a;background:rgba(224,49,49,.14)}
.dsacc-err{font-size:12px;color:#ff9a9a;padding:8px 10px;border-radius:10px;background:rgba(224,49,49,.1);line-height:1.5}
.dsacc-tabs{display:flex;gap:4px;flex-wrap:wrap}
.dsacc-tab{border:1px solid transparent;background:rgba(127,127,127,.09);color:var(--dsw-alias-label-secondary,#9aa4b2);font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;cursor:pointer;transition:all .12s ease}
.dsacc-tab:hover{background:rgba(127,127,127,.18)}
.dsacc-tab.on{color:#fff;background:rgba(77,107,254,.85);border-color:rgba(77,107,254,.6)}
.dsacc-sum{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa4b2);line-height:1.6}
.dsacc-sum b{color:var(--dsw-alias-label-primary,#f2f4f8);font-variant-numeric:tabular-nums}
.dsacc-chart{width:100%;border-radius:12px;background:rgba(127,127,127,.05);padding:6px 4px;box-sizing:border-box}
.dsacc-empty{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa4b2);text-align:center;padding:18px 0}
.dsacc-foot{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa4b2)}
.dsacc-refresh{margin-left:auto;border:1px solid rgba(127,127,127,.3);background:transparent;color:var(--dsw-alias-label-primary,#f2f4f8);font-size:12px;font-weight:600;padding:3px 12px;border-radius:999px;cursor:pointer}
.dsacc-refresh:hover{background:rgba(127,127,127,.14)}
.dsacc-refresh:disabled{opacity:.5;cursor:default}
.dsacc-note{font-size:10px;color:var(--dsw-alias-label-secondary,#7d8794);line-height:1.5}
`;

		function h(type, props) {
			var args = [type, props || null];
			for (var i = 2; i < arguments.length; i++) args.push(arguments[i]);
			return react.createElement.apply(null, args);
		}

		function fmtTokens(n) {
			if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
			if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
			return String(n);
		}

		function fmtCNY(v) {
			var n = parseFloat(v);
			return Number.isFinite(n) ? n.toFixed(2) : "—";
		}

		function shortDate(key) {
			var parts = key.split("-").map(Number);
			return parts[1] + "/" + parts[2];
		}

		function timeStr(ms) {
			var d = new Date(ms);
			var p = function (x) { return String(x).padStart(2, "0"); };
			return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
		}

		function LineChart(props) {
			var points = props.points || [];
			var W = 300, H = 110, PAD = 10, PLOT = 12;
			var max = 0;
			for (var i = 0; i < points.length; i++) if (points[i].total > max) max = points[i].total;
			if (max === 0) {
				return h("div", { className: "dsacc-empty" }, "暂无用量数据（还没有消耗过 token）");
			}
			var innerW = W - PAD * 2, innerH = H - PLOT - 8;
			var stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
			var coords = [];
			for (var j = 0; j < points.length; j++) {
				var x = points.length > 1 ? PAD + j * stepX : PAD + innerW / 2;
				var y = PLOT + innerH - (points[j].total / max) * innerH;
				coords.push([x, y]);
			}
			var line = coords.map(function (c) { return c[0] + "," + c[1]; }).join(" ");
			var area = coords.length > 1
				? "M " + coords[0][0] + "," + (PLOT + innerH) + " L " + line + " L " + coords[coords.length - 1][0] + "," + (PLOT + innerH) + " Z"
				: "";
			var first = points[0], last = points[points.length - 1];
			var els = [
				h("polyline", { key: "line", points: line, fill: "none", stroke: "#5a8dff", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
				area ? h("path", { key: "area", d: area, fill: "rgba(77,107,254,.16)", stroke: "none" }) : null,
				h("circle", { key: "dot", cx: coords[coords.length - 1][0], cy: coords[coords.length - 1][1], r: 3.5, fill: "#8ea2ff", stroke: "#fff", strokeWidth: 1 })
			];
			if (points.length === 1) els.push(h("circle", { key: "single", cx: coords[0][0], cy: coords[0][1], r: 4, fill: "#8ea2ff" }));
			return h("svg", { className: "dsacc-chart", viewBox: "0 0 " + W + " " + H, "aria-hidden": "true" },
				els,
				h("text", { x: PAD, y: H - 2, fontSize: 9, fill: "#7d8794" }, first.date ? shortDate(first.date) : ""),
				h("text", { x: W - PAD, y: H - 2, fontSize: 9, fill: "#7d8794", textAnchor: "end" }, last.date ? shortDate(last.date) : ""),
				h("text", { x: PAD, y: PLOT - 2, fontSize: 9, fill: "#7d8794" }, fmtTokens(max))
			);
		}

		function AccountWidget() {
			var _open = useState(false), open = _open[0], setOpen = _open[1];
			var _status = useState(null), status = _status[0], setStatus = _status[1];
			var _usage = useState(null), usage = _usage[0], setUsage = _usage[1];
			var _range = useState("7d"), range = _range[0], setRange = _range[1];
			var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];
			var _error = useState(null), error = _error[0], setError = _error[1];

			var loadStatus = useCallback(function () {
				return fetch("/deepseek-account/status", { cache: "no-store" })
					.then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
					.then(setStatus)
					.catch(function (e) { setError("余额获取失败：" + e.message); });
			}, []);

			var loadUsage = useCallback(function (r) {
				return fetch("/deepseek-account/usage?range=" + r, { cache: "no-store" })
					.then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
					.then(setUsage)
					.catch(function (e) { setError("用量获取失败：" + e.message); });
			}, []);

			var refresh = useCallback(function () {
				setBusy(true);
				setError(null);
				Promise.all([loadStatus(), loadUsage(range)]).finally(function () { setBusy(false); });
			}, [loadStatus, loadUsage, range]);

			// badge + panel data
			useEffect(function () {
				loadStatus();
				if (open) loadUsage(range);
			}, [open, range, loadStatus, loadUsage]);

			// 30s auto refresh while the panel is open
			useEffect(function () {
				if (!open) return undefined;
				var t = setInterval(function () {
					loadStatus();
					loadUsage(range);
				}, REFRESH_MS);
				return function () { clearInterval(t); };
			}, [open, range, loadStatus, loadUsage]);

			// ---------- derived ----------
			var balances = status && status.balance && Array.isArray(status.balance.balance_infos)
				? status.balance.balance_infos
				: [];
			var hero = balances.length > 0 ? parseFloat(balances[0].total_balance) : NaN;
			var heroNum = Number.isFinite(hero) ? hero : null;
			var available = status ? (status.balance ? status.balance.is_available !== false : null) : null;
			var chipText = null, chipClass = "";
			if (heroNum !== null) {
				chipText = "¥" + heroNum.toFixed(2);
				if (available === false || heroNum < LOW_BALANCE_DANGER) chipClass = "danger";
				else if (heroNum < LOW_BALANCE_WARN) chipClass = "warn";
			}
			var warnLine = null;
			if (heroNum !== null) {
				if (available === false) warnLine = h("div", { className: "dsacc-warn danger" }, "⚠ 账户当前不可用（is_available: false）");
				else if (heroNum < LOW_BALANCE_DANGER) warnLine = h("div", { className: "dsacc-warn danger" }, "⚠ 余额极低（¥" + heroNum.toFixed(2) + "），可能随时中断");
				else if (heroNum < LOW_BALANCE_WARN) warnLine = h("div", { className: "dsacc-warn warn" }, "⚠ 余额偏低（¥" + heroNum.toFixed(2) + "），建议尽快充值");
			}
			var summary = usage && usage.summary ? usage.summary : null;
			var lastRefresh = status || usage ? Math.max(status ? status.updatedAt || 0 : 0, usage ? usage.updatedAt || 0 : 0) : 0;

			return h("div", { className: "dsacc-root" },
				h("button", {
					type: "button",
					className: "dsacc-fab",
					"aria-label": open ? "收起 DeepSeek 账户面板" : "打开 DeepSeek 账户面板",
					title: "DeepSeek 账户",
					onClick: function () { setOpen(function (o) { return !o; }); }
				}, h("span", { className: "dsacc-fab-ico" }, "⚡")),
				!open && chipText ? h("span", { className: "dsacc-chip" + (chipClass ? " " + chipClass : "") }, chipText) : null,
				open ? h("div", { className: "dsacc-panel" },
					h("div", { className: "dsacc-head" },
						h("span", { className: "dsacc-title" }, "⚡ DeepSeek 账户"),
						h("span", {
							className: "dsacc-badge" + (available === false ? " bad" : ""),
							title: available === false ? "账户不可用" : "账户可用"
						}, available === false ? "不可用" : "可用"),
						h("button", { type: "button", className: "dsacc-close", "aria-label": "关闭", onClick: function () { setOpen(false); } }, "✕")
					),

					h("div", { className: "dsacc-sec" },
						h("div", { className: "dsacc-sec-title" }, "账户余额"),
						error ? h("div", { className: "dsacc-err" }, error) : null,
						!status ? h("div", { className: "dsacc-empty" }, "加载中…") :
							status.balanceError ? h("div", { className: "dsacc-err" }, "余额获取失败：" + status.balanceError) :
								balances.length === 0 ? h("div", { className: "dsacc-empty" }, "暂无余额数据") :
									balances.map(function (b, i) {
										return h("div", { key: i, className: "dsacc-bal" },
											h("div", { className: "dsacc-bal-row" },
												h("span", { className: "k" }, "总余额（" + (b.currency || "?") + "）"),
												h("span", { className: "v hero" }, "¥" + fmtCNY(b.total_balance))),
											h("div", { className: "dsacc-bal-row" },
												h("span", { className: "k" }, "充值余额"),
												h("span", { className: "v" }, "¥" + fmtCNY(b.topped_up_balance))),
											h("div", { className: "dsacc-bal-row" },
												h("span", { className: "k" }, "赠送余额"),
												h("span", { className: "v" }, "¥" + fmtCNY(b.granted_balance)))
										);
									}),
						warnLine
					),

					h("div", { className: "dsacc-sec" },
						h("div", { className: "dsacc-sec-title" }, "Token 用量"),
						h("div", { className: "dsacc-tabs" },
							RANGES.map(function (r) {
								return h("button", {
									key: r[0],
									type: "button",
									className: "dsacc-tab" + (range === r[0] ? " on" : ""),
									onClick: function () { setRange(r[0]); }
								}, r[1]);
							})
						),
						summary ? h("div", { className: "dsacc-sum" },
							h("span", {}, "总计：", h("b", {}, fmtTokens(summary.totalTokens)), " tokens"),
							h("span", {}, "输入 ", h("b", {}, fmtTokens(summary.inputTokens)), " · 输出 ", h("b", {}, fmtTokens(summary.outputTokens)), " · 缓存读取 ", h("b", {}, fmtTokens(summary.cacheReadTokens)))
						) : null,
						usage && usage.points ? h(LineChart, { points: usage.points }) : h("div", { className: "dsacc-empty" }, "加载中…"),
						h("div", { className: "dsacc-note" }, "数据来源：本机 dsh 会话记录中的 provider 用量（assistant/message usage）")
					),

					h("div", { className: "dsacc-foot" },
						h("span", {}, "上次刷新 " + (lastRefresh ? timeStr(lastRefresh) : "—") + (busy ? "（刷新中…）" : "")),
						h("button", { type: "button", className: "dsacc-refresh", disabled: busy, onClick: refresh }, "↻ 刷新")
					)
				) : null
			);
		}

		exports.inject = ["slots"];
		exports.apply = function (ctx) {
			ctx.effect(function () {
				var tag = document.createElement("style");
				tag.setAttribute("data-plugin", "@dsh-external/dsh-client-ui-deepseek-account");
				tag.textContent = CSS;
				document.head.append(tag);
				return function () { tag.remove(); };
			}, "deepseek-account: styles");
			ctx.slots.inject("shell.overlay", function () {
				return ctx.slots.register({ name: "shell.overlay", id: "deepseek-account" }, AccountWidget);
			});
		};

		return module.exports;
	}
});
