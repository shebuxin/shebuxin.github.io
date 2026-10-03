---
title: "Unbalanced Power Flow · 不平衡潮流"
permalink: /zh/teaching/course-development/physics-informed-gnn/unbalanced-power-flow/
layout: course
lang: zh
unbalanced_power_flow: true
course_title: "Physics-informed GNN · 微电网与配电系统"
parent_url: /zh/teaching/course-development/physics-informed-gnn/
parent_title: "Physics-informed GNN 课程"
description: "三相四线不平衡潮流交互教材：相域推导、中性点偏移、馈线例题、逐相参数实验与可编辑 Python。"
---

相同的总负荷，分配到三相之后，可能产生完全不同的电压结果。如果需求主要集中在 A 相，或者屋顶光伏只接入一相，会发生什么？本章保留三相与中性线，通过推导、例题和实验回答这些问题。

<nav class="bf-toc" aria-label="本章导航"><a href="#background">背景</a><a href="#formulation">公式推导</a><a href="#worked-example">例题</a><a href="#interactive-lab">交互实验</a><a href="#code-lab">Python</a><a href="#practice">练习</a></nav>

## 1. 从单相等值走向四导线模型
{: #background }

在 [Balanced Power Flow]({{ '/zh/teaching/course-development/physics-informed-gnn/balanced-power-flow/' | relative_url }}) 中，三相幅值相同，相角相差 120°，可以用一个等值相表示网络。单相用户和逆变器破坏了这一对称性：现在每一相都有自己的复功率、电压和电流。

不平衡负荷还会产生**中性线返回电流**。中性线阻抗有限时，当地中性点电压不再等于电源接地点电压。用户实际得到的是**相线对当地中性点的电压**，不能只看相线对电源参考点的电压。四线模型在低压配电分析中的意义，可参见 [Claeys、Geth 与 Deconinck 的研究](https://arxiv.org/abs/2204.08126)。

{% include unbalanced-overview.html %}

实验采用**辐射型三节点、三相四线 AC 模型**。节点 1 是平衡理想电源，其中性点接地。负荷与固定 PQ 光伏逆变器按星形连接，下游中性点通过中性线返回电源，没有额外的接地或大地回流路径。线路包含可调的相间互电抗与中性线阻抗；为便于教学，相线与中性线之间的互阻抗设为零。

<div class="uf-compare">先预测，再拖动：如果增加 A 相负荷，B、C 相电压一定会同时下降，而且降幅相同吗？共享中性线使这个判断未必成立。</div>

## 2. 推导相域潮流方程
{: #formulation }

### 步骤 A：区分导线电压与负荷端电压

采用 RMS 复数相量。V<sub>i,a</sub>、V<sub>i,b</sub>、V<sub>i,c</sub>、V<sub>i,n</sub> 分别表示四根导线对电源参考点的电压。星形负荷的端电压是：

<div class="bf-equation" data-math="U_{i,\phi}=V_{i,\phi}-V_{i,n},\qquad \phi\in\{a,b,c\}"></div>

继续采用三相总容量 1 MVA、线电压 400 V 的基准，但这次功率按每相分别指定：

<div class="bf-equation" data-math="\begin{aligned}S_{B,\phi}&amp;=S_{B,3\phi}/3,\qquad V_{B,\phi}=V_{B,LL}/\sqrt3\\Z_B&amp;=V_{B,\phi}^2/S_{B,\phi}=0.16\ \Omega\\I_B&amp;=S_{B,\phi}/V_{B,\phi}=1443.38\ \mathrm A\end{aligned}"></div>

因此，相电压基准约为 230.94 V，每相容量基准为 333.333 kVA。一个 **90 kW 单相负荷**的有功需求在每相容量基准上为 0.27 pu，不能套用 90 kW 三相总负荷对应的 0.09 pu。

### 步骤 B：把各相恒定 PQ 需求转换成电流

规定**净需求为正表示消耗**。本例光伏单位功率因数运行，所以 s<sub>i,φ</sub> = (P<sub>D,i,φ</sub> − P<sub>PV,i,φ</sub>) + jQ<sub>D,i,φ</sub>。这里的净需求符号与上一章的净注入符号相反。负荷无功为 Q<sub>D</sub> = P<sub>D</sub> tan(arccos PF)。

<div class="bf-equation" data-math="\begin{aligned}s_{i,\phi}&amp;=U_{i,\phi}\bigl(I_{i,\phi}^{load}\bigr)^*\\I_{i,\phi}^{load}&amp;=\left(s_{i,\phi}/U_{i,\phi}\right)^*\\I_{i,n}^{load}&amp;=-\left(I_{i,a}^{load}+I_{i,b}^{load}+I_{i,c}^{load}\right)\end{aligned}"></div>

负荷四个端子的电流之和为零。理想的零阻抗中性线仍然可以流过非零电流。只有三相基波电流平衡时，返回电流才为零；本章没有包含谐波。

### 步骤 C：对四导线支路应用 KVL

将导线电压与电流组成四维向量，一般串联线路使用 4 × 4 阻抗矩阵：

<div class="bf-equation" data-math="\boldsymbol V_j=\boldsymbol V_i-Z_{ij}\boldsymbol I_{ij},\qquad \boldsymbol V_i=\begin{bmatrix}V_{i,a}\\V_{i,b}\\V_{i,c}\\V_{i,n}\end{bmatrix}"></div>

交互模型使用对称矩阵：三相自阻抗相同，为 z<sub>s</sub>；相间互阻抗 z<sub>m</sub> = jx<sub>m</sub>；中性线自阻抗为 z<sub>n</sub>：

<div class="bf-equation" data-math="Z=\begin{bmatrix}z_s&amp;z_m&amp;z_m&amp;0\\z_m&amp;z_s&amp;z_m&amp;0\\z_m&amp;z_m&amp;z_s&amp;0\\0&amp;0&amp;0&amp;z_n\end{bmatrix},\qquad x_m=\mu x_s"></div>

μ 控制相间互电抗与自电抗的比例。这是一组说明原理的参数，不是某种电缆的规格。设置 z<sub>n</sub> = 0 会使本网络下游中性点电压为零，并不等于断开中性线。实际接地与中性线连接需要显式建模，可参见 [OpenDSS 中性线约定](https://opendss.epri.com/NeutralRules.html)。

<details class="bf-details"><summary>为什么改变 A 相会影响 B、C 相？</summary><p>由于 Iₙ = −(Iₐ + Iᵦ + I𝒸)，把各相导线的 KVL 方程减去中性线 KVL 方程，得到：</p><div class="bf-equation" data-math="\boldsymbol U_j=\boldsymbol U_i-\left(Z_{pp}+z_n\boldsymbol 1\boldsymbol 1^T\right)\boldsymbol I_{abc}"></div><p>共享中性线项包含三相电流之和。因此，即使 μ = 0，有限中性线阻抗也会耦合各相负荷端电压。只有中性线阻抗与相间互阻抗同时为零，三个独立单相计算才会复现本模型。</p></details>

### 步骤 D：用前推回代求解辐射型馈线

将所有节点初始化为电源相量，然后重复：

1. 根据当前相对中性点电压，计算每个负荷的四端子电流。
2. **回代：** 从末端向电源汇总下游电流，得到各支路电流。
3. **前推：** 从节点 1 出发，沿馈线应用四线 KVL，更新导线电压。

对于本例三节点链：

<div class="bf-equation" data-math="\begin{aligned}\boldsymbol I_{23}&amp;=\boldsymbol I_3^{load}\\\boldsymbol I_{12}&amp;=\boldsymbol I_2^{load}+\boldsymbol I_{23}\\\boldsymbol V_2^{sweep}&amp;=\boldsymbol V_1-Z_{12}\boldsymbol I_{12}\\\boldsymbol V_3^{sweep}&amp;=\boldsymbol V_2^{sweep}-Z_{23}\boldsymbol I_{23}\end{aligned}"></div>

实现使用 α = 0.65 的阻尼更新：

<div class="bf-equation" data-math="\boldsymbol V^{(k+1)}=(1-\alpha)\boldsymbol V^{(k)}+\alpha\boldsymbol V^{sweep,(k)}"></div>

停止条件是最大复数导线电压残差 ‖V<sup>sweep</sup> − V‖∞ 小于 10<sup>−10</sup> pu。达到 200 次更新或出现过低、非有限电压时报告失败。算法失败本身不能证明电压崩溃或不存在其他解。支路断开另行报告为超出单电源模型范围的孤岛。

### 步骤 E：计算损耗与电压不平衡指标

本模型的互阻抗是纯电抗，因此采用物理单位时，全部导线的有功损耗为：

<div class="bf-equation" data-math="P_{loss}=r_s\left(|I_a|^2+|I_b|^2+|I_c|^2\right)+r_n|I_n|^2"></div>

电流用 A、电阻用 Ω，结果为 W。**不要再次乘三**，式中已经包含三相电流。将支路两端注入的四导线功率相加，也会得到同样的总损耗；应保留中性线导体对应的项。

用序分量概括相对中性点的复电压。取 a = e<sup>j2π/3</sup>，相序 ABC：

<div class="bf-equation" data-math="\begin{bmatrix}U_0\\U_1\\U_2\end{bmatrix}=\frac13\begin{bmatrix}1&amp;1&amp;1\\1&amp;a&amp;a^2\\1&amp;a^2&amp;a\end{bmatrix}\begin{bmatrix}U_a\\U_b\\U_c\end{bmatrix},\qquad VUF=100\frac{|U_2|}{|U_1|}\%"></div>

U₁ 为正序，U₂ 为负序，U₀ 为零序。本章 **VUF 专指负序与正序幅值之比**，与 [OpenDSS NEMA 不平衡指标说明](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html)中的幅值偏差指标不同。VUF 较小，不保证各相电压正常，也不保证中性点偏移较小。

## 3. 例题：总负荷仍为 300 kW，三相分配不同
{: #worked-example }

节点 1 提供平衡的 400 V 线电压。节点 2 每相消耗 40 kW；节点 3 的 A/B/C 相消耗 **90 / 55 / 35 kW**。所有负荷功率因数为 0.95 滞后。节点 3 的 50 kW 光伏在三相上均分有功出力。

| 支路 | 相线自阻抗（Ω） | 中性线阻抗（Ω） | 相间互阻抗（Ω） |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.018 + j0.006 | j0.0016 |
| 2–3 | 0.008 + j0.006 | 0.012 + j0.004 | j0.0012 |

**1. 形成逐相净需求。** 光伏每相供应 50/3 kW，因此节点 3 的净有功需求为 73.333 / 38.333 / 18.333 kW。无功需求仍为 P<sub>D,φ</sub> tan(arccos 0.95)，本例光伏不供应无功。

**2. 求电流与返回路径。** 将复需求除以各自的相对当地中性点电压，再取共轭。把三相电流按复数相量相加，得到中性线返回电流。直接把电流幅值相加会得到错误结果。

**3. 迭代并核对运行点。** 基准例题得到节点 3 的负荷端电压：

| 相 | 幅值（pu） | 幅值（V RMS） | 相角（°） |
|---|---|---|---|
| A | 0.91917 | 212.27 | +0.1180 |
| B | 0.98032 | 226.39 | −122.0550 |
| C | 1.00438 | 231.95 | +121.2865 |

中性点偏移约 **7.637 V**；支路 1–2 的中性线电流约 **242.81 A**。总有功损耗为 **9.5971 kW**，参考电源供应 **259.5971 kW**，满足 259.5971 + 50 − 300 = 9.5971 kW。节点 3 的 VUF 仅为 **0.9028%**，但 A 相已经低于实验中的 0.95 pu 教学限值。

选择下方的**相同总负荷，均分三相**，将节点 3 改为 60 / 60 / 60 kW，保持总负荷与光伏不变。同时观察中性线电流、中性点偏移、逐相电压和损耗。若要精确复现上一章例题，还应把 μ 设为零，使平衡三相看到相同的无互耦串联阻抗。

## 4. 交互实验：改变一相，观察三相
{: #interactive-lab }

拖动各相负荷、切换光伏接入相，或者比较有限与理想中性线。电网图、相量图、电压分布、电流负载率和数值表均使用同一个求解运行点。电压带、VUF 阈值与电流限值是教学设置，不是标准合规评估。

{% include unbalanced-lab.html %}

## 5. 修改并运行四线求解器
{: #code-lab }

滑块使用 JavaScript 求解器即时反馈。Python 区在浏览器 Worker 中执行相同的四线方程，并绘制自己的结果。实验代码和实际求解器源码都可以编辑。先尝试在保持总需求不变的情况下平衡节点 3：

```python
case.update(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)
result = solve(case)
```

{% include course-code.html prefix="uf" root_id="unbalanced-code" source="/assets/code/unbalanced_power_flow.py" %}

将下面的循环加入实验，可以在其余参数固定时比较光伏接入相，最后一次成功求解的结果将被绘制：

```python
for connection in ("balanced", "a", "b", "c"):
    trial = dict(case, dg_phase=connection)
    solved = solve(trial)
    if solved["ok"]:
        end = solved["buses"][2]
        print(connection, [round(p["vm_pu"], 4) for p in end["phases"]],
              round(end["components"]["vuf_pct"], 3),
              round(solved["loss_kw"], 3))
        result = solved
    else:
        print(connection, solved["reason"])
```

## 6. 练习与解释
{: #practice }

<form class="bf-quiz uf-quiz"><fieldset><legend>理想中性线设置约束的是什么？</legend><label><input type="radio" name="uf-neutral-quiz" value="voltage"> 中性线导体电压为零，但返回电流仍可能非零。</label><label><input type="radio" name="uf-neutral-quiz" value="current"> 无论如何分配负荷，中性线电流都为零。</label><label><input type="radio" name="uf-neutral-quiz" value="open"> 中性线断开。</label></fieldset><button class="btn" type="submit">检查答案</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **中性线耦合：** 设置 μ = 0，保持有限中性线阻抗，将 A 相负荷增加 10 kW，记录三相电压。再采用理想中性线重复，用共享中性线矩阵项解释差别。
2. **总需求相同：** 比较 90 / 55 / 35 kW 与 60 / 60 / 60 kW，保持功率因数、光伏出力与接入方式、阻抗不变。解释中性线损耗与最低电压的变化。
3. **一个指标不够：** 找到 VUF 小于 2%，但某相电压超出 0.95–1.05 pu 的收敛运行点。用 U₀、U₂ 和中性点偏移讨论 VUF 的含义与局限。
4. **单相光伏：** 将 50 kW 依次接在 A、B、C 相，判断在当前运行点哪个方案更能改善最低电压，再在高负荷时重复。不要预先假设所有工况的最佳接入相都相同。
5. **N-1 标签：** 断开支路 2–3，区分孤岛、算法不收敛、以及连通但越限的状态。固定 PQ 光伏不会在馈线断开后自动成为构网电源。

## 7. 适用范围与后续实现

本章是基波、辐射型教学模型，不包含三角形负荷、电压相关负荷、不对称导线几何、相线与中性线互阻抗、下游接地与大地回流、变压器、调压器、谐波、逆变器能力限值或动态与保护行为。支路断开时四根导线同时断开，没有建模仅中性线断开的故障。孤岛在本模型中没有电压参考。

后续 **PandaPower-based Implementation** 将明确比较工具的建模假设。[pandapower `runpp_3ph` 文档](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html)说明了序域求解和大地回流、星形连接约定。在匹配这些假设之前，不应认为其结果会与本章显式中性线模型一致。

### 参考资料

* [Claeys、Geth、Deconinck：四线配电网络建模](https://arxiv.org/abs/2204.08126)。
* [OpenDSS：中性线连接约定](https://opendss.epri.com/NeutralRules.html)。
* [OpenDSS：基于幅值偏差的 NEMA 不平衡指标](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html)。
* [pandapower：三相不平衡潮流](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html)。
