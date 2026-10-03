---
title: "Balanced Power Flow · 平衡潮流"
permalink: /zh/teaching/course-development/physics-informed-gnn/balanced-power-flow/
layout: course
lang: zh
balanced_power_flow: true
course_title: "Physics-informed GNN · 微电网与配电系统"
parent_url: /zh/teaching/course-development/physics-informed-gnn/
parent_title: "Physics-informed GNN 课程"
description: "平衡三相 AC 潮流互动教材：背景、公式推导、馈线例题、参数实验和可编辑 Python。"
---

为什么负荷增加时馈线电压会下降？本地发电能否使潮流反向？无功支撑会改变什么？本章从模型推导出发，计算一个具体例题，再通过参数实验与 Python 验证你的预测。

<nav class="bf-toc" aria-label="本章导航"><a href="#background">背景</a><a href="#formulation">公式推导</a><a href="#worked-example">例题</a><a href="#interactive-lab">交互实验</a><a href="#code-lab">Python</a><a href="#practice">练习</a></nav>

## 1. 背景：微电网的一个运行快照
{: #background }

潮流计算描述的是一个**稳态运行点**。给定网络阻抗、负荷、发电与电压参考，求解节点电压，再计算线路电流、功率传输和损耗。对于微电网与配电馈线，这些结果可以帮助判断切换操作前后的电压下降、反向潮流与线路负载情况。

平衡三相系统中，三相幅值相等，相角相差 120°。在阻抗对称、注入平衡的条件下，可以用单相或正序等值分析。**平衡不意味着所有节点电压相同，也不意味着无功功率为零。**

<div class="bf-equation" data-math="\begin{aligned}V_a&amp;=v e^{j\theta}\\V_b&amp;=v e^{j(\theta-2\pi/3)}\\V_c&amp;=v e^{j(\theta+2\pi/3)}\end{aligned}"></div>

{% include balanced-overview.html %}

### 本章的模型假设

本章的方程推导和交互实验采用以下假设：

- **正弦稳态：** 电压与电流用有效值复相量表示。
- **三相平衡：** 网络参数对称，负荷与分布式电源在三相上均衡分配。采用单相等值表示网络，P、Q 表示三相总功率。
- **线路采用串联阻抗：** 保留电阻 R 与电抗 X，忽略线路充电、并联支路和变压器。
- **负荷与分布式电源采用恒定 PQ：** 每个运行点的有功 P、无功 Q 为指定值，求解过程中不随电压变化；节点电压幅值和相角由潮流方程求得。
- **只有一个电压参考：** 平衡节点的电压幅值和相角固定，其有功、无功供给平衡网络其余节点的净注入与线路损耗。

这些假设定义通用模型。下方例题再给出具体馈线、节点编号，以及负荷与发电的设置。

对于后续 N-1 预测任务，拓扑与运行点可作为输入，潮流解得到的电压、电流可作为标签或物理一致性检查。**求解收敛不等于运行安全**：还需要检查限值、连通性与模型适用范围。动态稳定性和保护行为需要另外分析。

## 2. 推导平衡 AC 潮流方程
{: #formulation }

### 步骤 A：统一基准

采用三相总容量基准 S<sub>B</sub> 与线电压基准 V<sub>LL,B</sub>。相电压基准是 V<sub>LL,B</sub>/√3；阻抗基准对应**每相阻抗**，P、Q 在该容量基准上表示**三相总功率**。

<div class="bf-equation" data-math="\begin{aligned}Z_B&amp;=\frac{V_{LL,B}^{2}}{S_B},\qquad I_B=\frac{S_B}{\sqrt{3}V_{LL,B}}\\z_{ij}^{pu}&amp;=\frac{r_{ij}+jx_{ij}}{Z_B},\qquad S_i^{pu}=\frac{P_i+jQ_i}{S_B}\end{aligned}"></div>

先确定基准，再把线路阻抗和功率注入换算为标幺值。采用三相总功率基准后，不要把三相总功率再次除以三。

### 步骤 B：构建节点导纳矩阵

串联支路导纳 y<sub>ij</sub> = 1/z<sub>ij</sub>。将导纳加入两个对角元素，并从对应的两个非对角元素中减去；断开线路时，移除这四项贡献。本例忽略线路充电、并联支路、变压器和互感。

<div class="bf-equation" data-math="\begin{aligned}Y_{ii}&amp;=\sum_{k\in\mathcal N_i}y_{ik}\\Y_{ij}&amp;=-y_{ij}\quad(i\ne j),\qquad \boldsymbol I=Y_{bus}\boldsymbol V\end{aligned}"></div>

{% include power-flow-illustration.html kind="admittance" %}

### 步骤 C：从电流得到复功率注入

规定**向网络供电的净注入为正**：P<sup>spec</sup> = P<sub>G</sub> − P<sub>D</sub>，Q<sup>spec</sup> = Q<sub>G</sub> − Q<sub>D</sub>。将基尔霍夫电流定律与 S = VI* 结合：

<div class="bf-equation" data-math="S_i=V_i I_i^*=V_i\left(\sum_j Y_{ij}V_j\right)^*"></div>

{% include power-flow-illustration.html kind="injection" %}

令 V<sub>i</sub> = v<sub>i</sub>e<sup>jθᵢ</sup>、Y<sub>ij</sub> = G<sub>ij</sub> + jB<sub>ij</sub>、δ<sub>ij</sub> = θ<sub>i</sub> − θ<sub>j</sub>，展开复数乘积：

<div class="bf-equation" data-math="\begin{aligned}P_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij}\bigr)\\Q_i&amp;=\sum_j v_i v_j\bigl(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij}\bigr)\end{aligned}"></div>

这里保留了电阻与无功耦合。对于配电馈线，忽略 R 的近似可能丢失电压下降和损耗的重要影响。

### 步骤 D：确定各节点的已知量与未知量

| 节点类型 | 指定量 | 求解量 |
|---|---|---|
| 平衡 / 参考节点 | 电压幅值、相角 | P、Q 注入 |
| PQ 节点 | 净 P、Q | 电压幅值、相角 |
| PV 节点 | P、电压幅值 | Q、相角 |

在本章假设下，负荷和固定 PQ 分布式电源都接在 **PQ 节点**上。未知量是这些节点的电压相角与幅值，平衡节点电压已知。将未知量组成向量 x = [θ<sub>PQ</sub><sup>T</sup>, v<sub>PQ</sub><sup>T</sup>]<sup>T</sup>。表中的 PV 节点用于完整说明节点分类，它对应电压调节，本章实验不采用该类型。节点分类与非线性功率平衡形式可参见 [MATPOWER AC 潮流手册](https://matpower.app/manual/matpower/ACPowerFlow.html)。

### 步骤 E：用牛顿–拉夫逊方法求解

从平坦电压与零相角开始，计算指定功率与当前计算功率的偏差。J 定义为**计算注入**对 x 的导数，因此下面的更新采用加号：

<div class="bf-equation" data-math="\begin{aligned}\Delta\boldsymbol s&amp;=\begin{bmatrix}\boldsymbol P_{PQ}^{spec}-\boldsymbol P_{PQ}\\\boldsymbol Q_{PQ}^{spec}-\boldsymbol Q_{PQ}\end{bmatrix}\\J&amp;=\begin{bmatrix}H&amp;N\\M&amp;L\end{bmatrix}=\frac{\partial(\boldsymbol P_{PQ},\boldsymbol Q_{PQ})}{\partial(\boldsymbol\theta_{PQ},\boldsymbol v_{PQ})}\end{aligned}"></div>
<div class="bf-equation" data-math="\begin{aligned}J(x^{(k)})\Delta x^{(k)}&amp;=\Delta\boldsymbol s^{(k)}\\x^{(k+1)}&amp;=x^{(k)}+\alpha\Delta x^{(k)}\end{aligned}"></div>

{% include power-flow-illustration.html kind="newton" %}

实现采用解析雅可比矩阵、带主元选择的消元和回溯步长 α，使偏差下降并保持电压幅值为正。停止条件为 ‖Δs‖∞ &lt; 10<sup>−10</sup> pu；迭代停滞或完成 30 次更新仍不收敛时报告失败。算法不收敛本身并不能证明物理系统不存在解。

<details class="bf-details"><summary>展开雅可比矩阵各元素</summary><p>当 i ≠ j：</p><div class="bf-equation" data-math="\begin{aligned}H_{ij}&amp;=v_i v_j(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\\N_{ij}&amp;=v_i(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\M_{ij}&amp;=-v_i v_j(G_{ij}\cos\delta_{ij}+B_{ij}\sin\delta_{ij})\\L_{ij}&amp;=v_i(G_{ij}\sin\delta_{ij}-B_{ij}\cos\delta_{ij})\end{aligned}"></div><p>当 i = j：</p><div class="bf-equation" data-math="\begin{aligned}H_{ii}&amp;=-Q_i-B_{ii}v_i^2\\N_{ii}&amp;=P_i/v_i+G_{ii}v_i\\M_{ii}&amp;=P_i-G_{ii}v_i^2\\L_{ii}&amp;=Q_i/v_i-B_{ii}v_i\end{aligned}"></div><p>对应的复数矩阵导数可参见 <a href="https://matpower.org/documentation/ref-manual/legacy/functions/dSbus_dV.html">MATPOWER 电压导数文档</a>。</p></details>

### 步骤 F：计算线路功率与损耗

根据节点电压计算线路电流，再计算两端注入线路的复功率，其和为线路复损耗。本模型只有串联阻抗，两端电流幅值相同。

<div class="bf-equation" data-math="\begin{aligned}I_{ij}&amp;=(V_i-V_j)/z_{ij}\\S_{ij}&amp;=V_i I_{ij}^*,\qquad S_{ji}=-V_j I_{ij}^*\\P_{loss,ij}&amp;=P_{ij}+P_{ji}=r_{ij}|I_{ij}|^2\end{aligned}"></div>

## 3. 例题：400 V 馈线
{: #worked-example }

### 建立馈线与节点设置

考虑一个 **400 V 三节点配电馈线**。节点 1 是上级电源，通过线路 1–2 向节点 2 供电，再通过线路 2–3 向下游节点 3 供电。线路 1–3 是常开联络线，后续实验中可以将其闭合，形成替代供电路径。

{% include power-flow-illustration.html kind="feeder" %}

| 节点 | 设备与指定量 | 潮流节点类型 |
|---|---|---|
| 1 | 上级电源，电压固定为 1∠0° pu | 平衡 / 参考节点 |
| 2 | 120 kW 负荷，功率因数 0.95 滞后 | PQ |
| 3 | 180 kW 负荷，功率因数 0.95 滞后；另接 50 kW、单位功率因数的分布式电源 | PQ |

节点 3 的逆变器按**指定 P、Q 注入**建模：P<sub>G</sub> = 50 kW、Q<sub>G</sub> = 0，不调节该节点的电压幅值。将发电与负荷合并为净注入后，节点 3 仍是 PQ 节点。

取 S<sub>B</sub> = 1 MVA、V<sub>LL,B</sub> = 0.4 kV，得到 Z<sub>B</sub> = 0.16 Ω、I<sub>B</sub> = 1443.38 A。线路每相阻抗如下：

| 线路 | 阻抗（Ω） | 阻抗（pu） |
|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.075 + j0.050 |
| 2–3 | 0.008 + j0.006 | 0.050 + j0.0375 |
| 1–3，常开联络线 | 0.022 + j0.014 | 0.1375 + j0.0875 |

节点 1 是参考节点，节点 2、3 是 PQ 节点，因此四个未知量为 x = [θ₂, θ₃, v₂, v₃]<sup>T</sup>。

### 写出注入并求解

**1. 由功率因数得到无功需求。** Q<sub>D</sub> = P<sub>D</sub> tan(arccos 0.95)，得到节点 2 的无功为 39.44 kvar、节点 3 为 59.16 kvar。

**2. 写出净注入。** S₂<sup>spec</sup> = −0.120 − j0.03944 pu，S₃<sup>spec</sup> = −0.130 − j0.05916 pu。50 kW 发电抵消部分有功负荷，不抵消无功负荷。

**3. 计算第一步牛顿更新。** 平坦起点的计算注入为零，所以偏差为 [−0.120, −0.130, −0.03944, −0.05916]<sup>T</sup>。在该运行点构建 J，求解 Δx，再重复更新。

**4. 核对结果。** 基准例题得到 |V₂| ≈ **0.97559 pu**、|V₃| ≈ **0.96657 pu**、θ₂ ≈ **−0.2994°**、θ₃ ≈ **−0.4159°**，总有功损耗 ≈ **6.8389 kW**。平衡节点提供约 **256.8389 kW**，满足 256.8389 + 50 − 300 = 6.8389 kW。

先预测两个负荷都加倍会怎样，再选择下方的**高负荷**场景。比较电压下降与损耗，观察非线性变化。

## 4. 交互实验：改变运行点
{: #interactive-lab }

每次先改变一个控制量。上方三相相量图显示节点 3 的电压，它与电网图、电压分布、线路负载率和牛顿迭代表都基于同一运行点更新。断开辐射型支路会形成孤岛；闭合联络线可以提供替代供电路径。

{% include balanced-lab.html %}

## 5. 修改并运行 Python
{: #code-lab }

滑块实验使用浏览器原生求解器提供即时反馈；可编辑的 Python 求解器实现同样的方程，并通过数值对照检查。修改求解器会改变**代码结果**，参数实验保留为参照。尝试在 `solve(case)` 前加入 `case["q_support_kvar"] = 60`，比较电压与损耗。

{% include balanced-code.html %}

## 6. 练习与解释
{: #practice }

<form class="bf-quiz"><fieldset><legend>“平衡”要求一个节点满足什么条件？</legend><label><input type="radio" name="bf-balance" value="phase"> 三相电压幅值相等，相角相差 120°。</label><label><input type="radio" name="bf-balance" value="bus"> 所有节点的电压幅值相等。</label><label><input type="radio" name="bf-balance" value="reactive"> 所有节点的无功功率为零。</label></fieldset><button class="btn" type="submit">检查答案</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **功率因数：** 有功负荷保持不变，将功率因数从 0.95 降至 0.80。记录电流、最低电压与损耗，用 S = P + jQ 和 I = (S/V)* 解释变化。
2. **无功支撑：** 负荷倍率为 2.0 时，在节点 3 注入 60 kvar。与无支撑状态比较，能否消除所有电压越限？用实验验证。
3. **N-1 拓扑：** 在辐射型网络中断开线路 1–2，再在闭合联络线后重复。区分孤岛、收敛但越限、以及满足教学限值的状态。
4. **编写扫描：** 在 Python 中将负荷倍率从 0.5 扫描到 2.0，打印每步 |V₃| 与损耗。保留最后一次成功求解的字典到 `result`，展示对应电压分布。

## 7. 模型范围与后续内容

本章是固定平衡节点电压、恒定 PQ 的平衡稳态教学模型，未包含相间不平衡、随电压变化的负荷、变压器与分接头、逆变器能力约束、电源容量限制、线路充电和保护。孤岛被标为超出单平衡节点模型范围，其 DG 不会自动转成构网电源。后续 [Unbalanced Power Flow]({{ '/zh/teaching/course-development/physics-informed-gnn/unbalanced-power-flow/' | relative_url }}) 将放宽三相对称假设，**PandaPower-based Implementation** 将扩展建模流程。

### 参考资料
{: #references }

* [MATPOWER：AC 潮流](https://matpower.app/manual/matpower/ACPowerFlow.html)：节点类型与牛顿求解。
* [MATPOWER：功率注入的电压导数](https://matpower.org/documentation/ref-manual/legacy/functions/dSbus_dV.html)：解析电压灵敏度。
* [pandapower：平衡 AC 潮流](https://pandapower.readthedocs.io/en/stable/powerflow/ac.html)：后续实现模块的算法接口。
* [Pyodide：在浏览器 Worker 内执行 Python](https://pyodide.org/en/stable/usage/webworker.html)：代码区运行方式。
