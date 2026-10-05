---
title: "PandaPower-based Implementation"
permalink: /zh/teaching/physics-informed-gnn/pandapower-based-implementation/
layout: course
lang: zh
pandapower_implementation: true
course_title: "Physics-informed GNN · 微电网与配电系统"
parent_url: /zh/teaching/physics-informed-gnn/
parent_title: "返回 Physics-informed GNN 课程"
description: "在浏览器中用真实 pandapower 建网并运行平衡与三相潮流，包含公式、例题、参数实验、可编辑 Python 和 N-1 筛查。"
redirect_from:
  - "/zh/teaching/course-development/physics-informed-gnn/pandapower-based-implementation/"
---

前两章解释了潮流方程。这一章把馈线图变成可以复现的计算实验：建立节点与设备，求解运行点，读取结果，再检查一条线路退出后的状态。网页直接运行 **pandapower 3.2.1**，并把潮流结果连接到安全预测数据的生成过程。

<nav class="bf-toc" aria-label="教材章节"><a href="#background">模型到代码</a><a href="#formulation">公式与单位</a><a href="#worked-example">例题</a><a href="#interactive-lab">交互实验</a><a href="#code-lab">Python</a><a href="#security">N-1 筛查</a><a href="#practice">练习</a></nav>

## 1. 把物理系统映射为设备表
{: #background }

建议先学习 [Balanced Power Flow]({{ '/zh/teaching/physics-informed-gnn/balanced-power-flow/' | relative_url }}) 与 [Unbalanced Power Flow]({{ '/zh/teaching/physics-informed-gnn/unbalanced-power-flow/' | relative_url }})。本章先说明物理假设怎样进入设备表和求解器，再在例题中给出具体馈线、节点编号与功率设置。

### 本章的模型假设

- **正弦稳态 AC：** 电压与电流采用基波 RMS 相量，求解静态运行点。
- **串联线路：** 保留电阻与电抗，并联电容设为零。本例网络只含线路，不含变压器和调压器。
- **恒定 PQ 设备：** 负荷的 P、Q 在求解过程中保持指定值。光伏采用固定 PQ 发电模型，本例 Q = 0，不调节电压。
- **明确选择相模型：** 平衡模式采用对称三相等值；三相模式逐相输入星形负荷与发电，采用序阻抗及大地回路表示，不单独求解有限阻抗中性线的电压。
- **一个外部电网参考：** `ext_grid` 给定正序电压幅值与相角；三相模式还需电源序阻抗参数。具体参数在例题中列出。

三相求解器的回流路径约定见 [pandapower 官方说明](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html)。下方用通用设备说明建模流程，例题中再定义节点编号与设备设置。

<div class="pp-workflow" role="list" aria-label="建模流程"><div role="listitem"><strong>1 · 描述系统</strong><code>bus, line, load, sgen</code><span>拓扑、阻抗、负荷与发电</span></div><div role="listitem"><strong>2 · 建网</strong><code>pp.create_*()</code><span>形成 net 中的设备表</span></div><div role="listitem"><strong>3 · 求解</strong><code>runpp / runpp_3ph</code><span>计算 AC 运行点</span></div><div role="listitem"><strong>4 · 检查</strong><code>net.res_*</code><span>供电、电压、电流与损耗</span></div></div>

{% include power-flow-illustration.html kind="mapping" %}

`net` 内包含多个 pandas DataFrame。输入表描述设备，`res_*` 表存储最近一次潮流结果。修改输入表不会自动更新结果，**修改后需要重新运行求解器**。

| 物理对象 | 平衡模型 | 三相模型 | 结果表 |
|---|---|---|---|
| 节点及额定电压 | `create_bus()` | 相同，`vn_kv` 仍为线电压 | `res_bus` / `res_bus_3ph` |
| 上级电源 | `create_ext_grid()` | 另需电源序阻抗参数 | `res_ext_grid` / `res_ext_grid_3ph` |
| 线路 | `create_line_from_parameters()` | 另需零序参数 | `res_line` / `res_line_3ph` |
| 恒 PQ 负荷 | `create_load()` | `create_asymmetric_load()` | 对应负荷结果表 |
| 固定 PQ 逆变器 | `create_sgen()` | `create_asymmetric_sgen()` | 对应发电结果表 |

固定 PQ 发电通过 `sgen`（平衡模式）或 `asymmetric_sgen`（三相模式）写入设备表。**PV inverter** 中的 PV 指光伏；潮流术语中的 **PV 节点**则指定有功和电压幅值。这里采用前述固定 PQ 假设，光伏在断网后也不会自动变成构网电源。

## 2. 从方程推到 API 参数
{: #formulation }

### A. 统一基准和单位

向 pandapower 输入物理量，无需先把所有参数手动换成标幺值。本例三相功率基准为 1 MVA，线电压基准为 0.4 kV：

<div class="bf-equation" data-math="Z_B=\frac{V_{B,LL}^2}{S_{B,3\phi}}=\frac{(0.4\ \mathrm{kV})^2}{1\ \mathrm{MVA}}=0.16\ \Omega"></div>

线路内部会完成物理阻抗到标幺阻抗的转换。单条等效线路满足：

<div class="bf-equation" data-math="Z_1=(r_1+jx_1)\ell,\qquad z_1=Z_1/Z_B"></div>

`length_km=1` 与 `r_ohm_per_km=0.012` 的乘积给出 **0.012 Ω 总电阻**。这里用的是教学等效参数，并不代表某种实际一公里电缆。本例忽略并联电容。参数定义与等效电路见 [pandapower 线路模型](https://pandapower.readthedocs.io/en/v3.2.1/elements/line.html)。

| 教材中的量 | API 参数 / 单位 | 输入示例 |
|---|---|---|
| 400 V 线电压 | `vn_kv`，kV | `0.4`，不是 `400` |
| 120 kW 三相总功率 | `load.p_mw`，MW | `0.120` |
| A 相 90 kW | `asymmetric_load.p_a_mw`，MW | `0.090` |
| 600 A 相电流限值 | `max_i_ka`，kA | `0.600` |
| 0.012 Ω 总电阻 | `r_ohm_per_km × length_km` | `0.012 × 1` |

负荷正功率表示消耗，`sgen` 和 `ext_grid` 正功率表示发电或供电。平衡负荷输入的是三相总功率；非对称负荷逐相输入。参见官方 [单位与符号约定](https://pandapower.readthedocs.io/en/v3.2.1/about/units.html)。

### B. 由有功与功率因数得到无功

滞后负荷的无功消耗为正。光伏有功与负荷功率因数分别设定：

<div class="bf-equation" data-math="\begin{aligned}Q_D&amp;=P_D\tan(\arccos\mathrm{PF})\\S_i^{inj}&amp;=(P_{G,i}-P_{D,i})+j(Q_{G,i}-Q_{D,i})\\S_i^{inj}&amp;=V_i\left(\sum_jY_{ij}V_j\right)^*\end{aligned}"></div>

120 kW、PF = 0.95 的负荷消耗约 39.442 kvar，对应 `p_mw=0.120`、`q_mvar=0.039442`。本例采用恒定 PQ 负荷，关闭电压相关负荷选项。AC 方程保留线路电阻与电抗，求解节点电压幅值和相角。

### C. 根据建模假设选择求解器

`runpp(net, algorithm="nr")` 用 Newton–Raphson 求解平衡 AC 方程。实验还提供 `bfsw` 前推回代算法供比较，参见 [平衡潮流选项](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac.html)。

这里切换 `nr` / `bfsw`，是在同一套平衡模型下比较数值算法；切换 `runpp()` / `runpp_3ph()` 则会改变相模型，不能把两种选择混在一起。前两章分别采用 NR 与四线前推回代的教学原因，见[求解方法对照]({{ '/zh/teaching/physics-informed-gnn/unbalanced-power-flow/' | relative_url }}#solver-choice)。

对于序阻抗可以解耦的对称线路，相域阻抗由序域转换得到：

<div class="bf-equation" data-math="Z_{abc}=A\,\mathrm{diag}(Z_0,Z_1,Z_2)A^{-1},\quad A=\begin{bmatrix}1&amp;1&amp;1\\1&amp;a^2&amp;a\\1&amp;a&amp;a^2\end{bmatrix},\quad a=e^{j2\pi/3}"></div>

本例取 Z₂ = Z₁、Z₀ = κZ₁，κ 是可调的零序 / 正序阻抗比。它是说明模型关系的参数，不能直接替代上一章单独指定的中性线阻抗。

`runpp_3ph()` 通过序网络耦合逐相恒 PQ 注入：正序使用 Newton–Raphson，零序和负序使用电流注入计算。除了非对称负荷，还需要零序线路参数与电源序阻抗信息，见 [三相潮流说明](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html) 和 [外部电源参数](https://pandapower.readthedocs.io/en/v3.2.1/elements/ext_grid.html)。

<div class="pp-model-note"><strong>比较结果之前，先比较回流路径假设。</strong> 上一章显式求解三相四线导体，保留下游有限中性线阻抗，且没有额外大地回流。pandapower 三相求解器采用大地回路表示，星形负荷的中性点与地统一处理。本章不能直接给出上一章的独立中性点偏移；相同负荷下，两种不平衡模型的数值不要求一致。</div>

### D. 从结果表检查功率平衡

线路两端的功率都以**流入线路**为正，所以有功损耗是两端注入之和：

<div class="bf-equation" data-math="P_{loss,ij}=P_{ij}^{from}+P_{ij}^{to},\qquad P_{grid}+P_{PV}-P_{served\ load}=\sum_{ij}P_{loss,ij}"></div>

`res_line.pl_mw` 已经是三相总损耗；`res_line_3ph` 则应把 `pl_a_mw + pl_b_mw + pl_c_mw` 相加。不要再把三相总结果乘以三。`p_from_mw` 为负表示反向潮流，并不表示负损耗。

## 3. 例题：先复现平衡结果，再改变模型
{: #worked-example }

### 建立馈线与节点设置

考虑一个 **400 V 三节点配电馈线**。节点 1 是上级电源，通过线路 1–2 连接节点 2，再通过线路 2–3 连接下游节点 3。线路 1–3 是初始断开的联络线，后续 N-1 实验中可以闭合。两个求解模式使用相同的节点与线路连接关系。

{% include power-flow-illustration.html kind="feeder" %}

| 节点 | 设备与指定量 | pandapower 表示 |
|---|---|---|
| 1 | 上级电源，正序电压 1∠0° pu | `ext_grid`，作为电压参考 |
| 2 | 120 kW 总负荷，PF = 0.95 滞后；三相模式均分为 40 / 40 / 40 kW | `load` 或 `asymmetric_load` |
| 3 | 180 kW 总负荷，PF = 0.95 滞后；三相模式分配为 90 / 55 / 35 kW；另接 50 kW 光伏 | 负荷表，加 `sgen` 或 `asymmetric_sgen` |

节点 3 的光伏按**指定 P、Q 注入**建模：总有功 50 kW、Q = 0，三相基准工况均分有功；它不调节电压，也不把该节点变为电压控制的 PV 节点。负荷与发电共同形成该节点的净注入。

### 设置线路与电源参数

取三相容量基准 1 MVA、线电压基准 0.4 kV。线路的正序、零序总阻抗和电流限值如下；初始 κ = Z₀/Z₁ = 3。

| 线路 | Z₁（Ω） | 三相模式的 Z₀（Ω） | 电流限值 |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.036 + j0.024 | 600 A |
| 2–3 | 0.008 + j0.006 | 0.024 + j0.018 | 600 A |
| 1–3，初始断开 | 0.022 + j0.014 | 0.066 + j0.042 | 600 A |

三相电源设 S<sub>sc,max</sub> = S<sub>sc,min</sub> = 1000 MVA、R/X = 0.1、X₀/X = 1、R₀/X₀ = 0.1，用于构造零序及负序电源表示。这些是教学假设，未作为实际馈线测量参数。

### 求解并核对结果

**第一步：运行平衡潮流。** 将节点 3 的 A/B/C 负荷控制相加，得到三相总负荷 180 kW。`runpp()` 的结果为：

| 结果 | 数值 |
|---|---|
| 节点 2 / 节点 3 电压 | 0.97559 / 0.96657 pu |
| 总线路损耗 | 6.83889 kW |
| 电源供电 | 256.83889 kW |
| 线路 1–2 电流 / 负载率 | 399.55 A / 66.592% |

它复现了第一章的平衡基准。检查 256.83889 + 50 − 300 = 6.83889 kW。

**第二步：总量不变，显示逐相差别。** 切换到三相模式。节点 2 仍为 40 / 40 / 40 kW，节点 3 则为 90 / 55 / 35 kW，光伏仍三相均分。κ = 3 时：

| 节点 3 结果 | A | B | C |
|---|---|---|---|
| 电压（pu） | 0.93382 | 0.97671 | 0.98850 |
| 相角（°） | −0.6311 | −121.2352 | +120.5968 |

总线路损耗变为 **8.51027 kW**，线路 1–2 最大相电流为 **557.07 A**，节点 3 的 VUF 为 **0.91098%**。总负荷没有变化，但 A 相已经低于教学电压下限。电源的零序 / 负序阻抗有限，其逐相电压也可能略有不同，固定的是正序电压。

**第三步：恢复逐相平衡。** 将节点 3 调成 60 / 60 / 60 kW。对称三相解会在数值容差内恢复平衡潮流的电压幅值和损耗。这个特殊情况可以核对单位、相功率分配和结果读取方式。

## 4. 在真实库上做参数实验
{: #interactive-lab }

启动运行环境后，拖动滑块观察电源电压、相负荷分配、线路阻抗、光伏接入相及电流限值的影响。展开建网代码，可以看到每个参数具体改变了哪个 API 调用。下方代码编辑器使用独立 Worker，可单独停止代码实验。

{% include pandapower-lab.html %}

**先预测再操作：** 只改变电流限值，会改变负载率而不改变普通潮流的电压和功率解；闭合联络线会重新分配潮流；辐射馈线退出 2–3 会使节点 3 失供，但剩余供电网络仍可能收敛。未供电节点的电压显示为“—”，不作为有效的零电压运行点。

## 5. 修改设备表，重新求解并读取结果
{: #code-lab }

下面把输入、模型源码和实验主程序分开。`main()` 先复制 `case`，依次调用 `build_network()` 建网、`run_network()` 求解、`collect_results()` 读取，并把结果返回给页面绘图。展开源码可查看这些函数的定义及依赖；`solve(case)` 是同样流程的封装，适合参数扫描。

{% include course-code.html prefix="pp" root_id="pandapower-code" source="/assets/code/pandapower_implementation.py" worker="/assets/js/pandapower-worker.js" %}

平衡模式下，在 `main()` 内、`run_network(net, parameters)` **之前**插入以下两行（保持 4 个空格缩进），直接修改节点 3 负荷表：

```python
    net.load.loc[net.load.bus == 2, "p_mw"] = 0.240
    net.load.loc[net.load.bus == 2, "q_mvar"] = 0.240 * math.tan(math.acos(parameters["pf"]))
```

示意图编号为 1/2/3，而这里的 pandas 索引为 0/1/2。建立更大网络时，应保留 `create_bus()` 返回的整数 ID，不要假设显示名称等于表格索引。本例结果读取函数针对**仅含线路的馈线**；加入变压器、开关或其他设备时，需要扩展连通性和功率平衡检查。

<div class="pp-downloads"><a href="{{ '/assets/code/pandapower_implementation.ipynb' | relative_url }}" download>下载 Notebook (.ipynb)</a><a href="{{ '/assets/code/pandapower_implementation.py' | relative_url }}" download>下载 Python 模型</a><a href="{{ '/assets/code/requirements-pandapower.txt' | relative_url }}" download>下载依赖清单</a></div>

本地运行时，将 Python 模型与依赖清单存到同一目录，创建 Python 3.12 虚拟环境后执行：

```bash
python -m pip install -r requirements-pandapower.txt
python pandapower_implementation.py
```

Notebook 内嵌模型源码，可以独立使用，包含依赖安装、DataFrame 检查、平衡 / 三相对比与 N-1 扫描。网页固定使用 pandapower 3.2.1、Pyodide 0.28.3，并关闭可选 Numba 加速。首次初始化需要联网下载环境；下载文件可保留一份可复现的课程实验。

## 6. 从运行点生成 N-1 标签
{: #security }

N-1 筛查分别求解基准运行点及选定设备的单一退出工况。标签需要包含**供电状态**，不能只检查 `net.converged`。本例的教学定义是：

<div class="bf-equation" data-math="\mathrm{secure}=\mathrm{converged}\ \land\ \mathrm{all\ buses\ supplied}\ \land\ (0.95\leq|V|\leq1.05)\ \land\ (L_{line}\leq100\%)\ \land\ (\mathrm{VUF}\leq2\%\text{, if 3ph})"></div>

这些限值用于教学。静态筛查不评估保护、暂态稳定、谐波或孤岛控制。求解失败也应单独记录，不能据此直接证明物理不可行。

将以下代码放入编辑器。闭合联络线后存在替代供电路径，每个退出工况都从相同的基准开始：

{% include power-flow-illustration.html kind="screening" %}

```python
import pandas as pd
base = dict(case, tie=True, trip12=False, trip23=False, trip13=False)
rows = []
for outage in (None, "trip12", "trip23", "trip13"):
    trial = dict(base)
    if outage:
        trial[outage] = True
    solved = solve(trial)
    rows.append({
        "outage": outage or "base",
        "converged": solved["ok"],
        "unsupplied": solved.get("unsupplied", []),
        "min_v_pu": solved.get("min_voltage"),
        "max_loading_pct": solved.get("max_loading"),
        "secure": solved.get("secure", False),
    })
    if solved["ok"]:
        result = solved
print(pd.DataFrame(rows).to_string(index=False))
```

后续构造 GNN 数据集时，可把节点负荷、发电和电压基准作为节点特征，把阻抗、电流限值及退出状态作为边特征。电压、负载率、失供状态和求解结果应分别保存为标签或元数据。保持节点 ID 与相序一致，按运行场景或拓扑划分测试集，避免相近的退出工况跨越训练集和测试集造成信息泄漏。

## 7. 预测、验证、解释
{: #practice }

1. 平衡模式比较 `nr` 与 `bfsw`：收敛后的运行点是否在数值容差内一致？
2. 将节点 3 从 60/60/60 改为 90/55/35 kW。解释为何 `runpp()` 不变，而 `runpp_3ph()` 会改变。
3. 将电流限值从 600 降到 300 A。为什么会出现过载，却没有自动削减负荷？普通潮流不强制满足热限值。
4. 联络线闭合与断开时分别运行 N-1 扫描，区分电压越限、失供和迭代未收敛。

<form class="bf-quiz pp-quiz"><fieldset><legend>辐射馈线最后一条线路退出后，net.converged 仍为 True，应如何判断？</legend><label><input type="radio" name="pp-answer" value="safe">整个馈线已满足安全要求。</label><label><input type="radio" name="pp-answer" value="zero">孤岛负荷处于有效的 0 pu 电压运行点。</label><label><input type="radio" name="pp-answer" value="supply">先检查未供电节点和运行限值，再赋予安全标签。</label><button type="submit" class="btn">检查答案</button><p data-quiz-feedback role="status" aria-live="polite"></p></fieldset></form>

通过可展开的 Python 源码把 API 与方程逐项对应，再以 Notebook 为起点扩展自己的馈线和课程例题。
