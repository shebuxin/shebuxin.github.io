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

<nav class="bf-toc" aria-label="本章导航"><a href="#background">背景</a><a href="#formulation">公式推导</a><a href="#solver-choice">求解方法</a><a href="#sequence-components">序分量</a><a href="#worked-example">例题</a><a href="#interactive-lab">交互实验</a><a href="#code-lab">Python</a><a href="#practice">练习</a></nav>

## 1. 从单相等值走向四导线模型
{: #background }

在 [Balanced Power Flow]({{ '/zh/teaching/course-development/physics-informed-gnn/balanced-power-flow/' | relative_url }}) 中，三相幅值相同，相角相差 120°，可以用一个等值相表示网络。单相用户和逆变器破坏了这一对称性：现在每一相都有自己的复功率、电压和电流。

不平衡负荷还会产生**中性线返回电流**。中性线阻抗有限时，当地中性点电压不再等于电源接地点电压。用户实际得到的是**相线对当地中性点的电压**，不能只看相线对电源参考点的电压。四线模型在低压配电分析中的意义，可参见 [Claeys、Geth 与 Deconinck 的研究](https://arxiv.org/abs/2204.08126)。

{% include unbalanced-overview.html %}

### 本章的模型假设

本章采用相域三相四线 AC 模型，方程和交互实验遵循以下假设：

- **正弦稳态：** 电压与电流采用基波 RMS 复相量，不包含谐波。
- **辐射型网络：** 保留 a、b、c 三根相线和 n 中性线，沿馈线逐支路计算电流与电压。
- **一个平衡理想电源：** 电源三相电压幅值和相角固定，其中性点接地；下游中性点经中性线返回电源，没有额外接地或大地回流路径。
- **星形恒定 PQ 设备：** 负荷逐相指定 P、Q，光伏按指定有功、Q = 0 注入；它们连接在相线与当地中性点之间，不调节节点电压。
- **串联四导线线路：** 保留相线和中性线的电阻、电抗，以及可调的相间互电抗；相线与中性线互阻抗设为零，忽略并联支路和变压器。

这些假设描述通用模型。下面先用 i、j、k 推导方程，再在例题中定义具体馈线、节点编号和逐相负荷。

<div class="uf-compare">先预测，再拖动：如果增加 A 相负荷，B、C 相电压一定会同时下降，而且降幅相同吗？共享中性线使这个判断未必成立。</div>

## 2. 推导相域潮流方程
{: #formulation }

### 步骤 A：区分导线电压与负荷端电压

采用 RMS 复数相量。V<sub>i,a</sub>、V<sub>i,b</sub>、V<sub>i,c</sub>、V<sub>i,n</sub> 分别表示四根导线对电源参考点的电压。星形负荷的端电压是：

<div class="bf-equation" data-math="U_{i,\phi}=V_{i,\phi}-V_{i,n},\qquad \phi\in\{a,b,c\}"></div>

{% include power-flow-illustration.html kind="neutral" %}

设三相总容量基准为 S<sub>B,3φ</sub>、线电压基准为 V<sub>B,LL</sub>。功率按每相指定，因此需要对应的每相基准：

<div class="bf-equation" data-math="\begin{aligned}S_{B,\phi}&amp;=S_{B,3\phi}/3,\qquad V_{B,\phi}=V_{B,LL}/\sqrt3\\Z_B&amp;=V_{B,\phi}^2/S_{B,\phi}=V_{B,LL}^2/S_{B,3\phi}\\I_B&amp;=S_{B,\phi}/V_{B,\phi}\end{aligned}"></div>

每相功率必须除以每相容量基准，而三相总功率除以三相总容量基准。例题中再代入具体数值，核对这两种换算。

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

{% include power-flow-solver-bridge.html %}

将所有节点初始化为电源相量，然后重复：

1. 根据当前相对中性点电压，计算每个负荷的四端子电流。
2. **回代：** 从末端向电源汇总下游电流，得到各支路电流。
3. **前推：** 从电源节点出发，沿馈线应用四线 KVL，更新导线电压。

用通用的 i → j → k 链说明一次更新：i 是电源，j、k 连接负荷，k 是末端。每个电压与电流向量都含 a、b、c、n 四个分量。

<div class="bf-equation" data-math="\begin{aligned}\boldsymbol I_{jk}&amp;=\boldsymbol I_k^{load}\\\boldsymbol I_{ij}&amp;=\boldsymbol I_j^{load}+\boldsymbol I_{jk}\\\boldsymbol V_j^{sweep}&amp;=\boldsymbol V_i-Z_{ij}\boldsymbol I_{ij}\\\boldsymbol V_k^{sweep}&amp;=\boldsymbol V_j^{sweep}-Z_{jk}\boldsymbol I_{jk}\end{aligned}"></div>

{% include power-flow-illustration.html kind="sweep" %}

实现使用 α = 0.65 的阻尼更新：

<div class="bf-equation" data-math="\boldsymbol V^{(k+1)}=(1-\alpha)\boldsymbol V^{(k)}+\alpha\boldsymbol V^{sweep,(k)}"></div>

停止条件是最大复数导线电压残差 ‖V<sup>sweep</sup> − V‖∞ 小于 10<sup>−10</sup> pu。达到 200 次更新或出现过低、非有限电压时报告失败。算法失败本身不能证明电压崩溃或不存在其他解。支路断开另行报告为超出单电源模型范围的孤岛。

### 步骤 E：计算各导线损耗

本模型的互阻抗是纯电抗，因此采用物理单位时，全部导线的有功损耗为：

<div class="bf-equation" data-math="P_{loss}=r_s\left(|I_a|^2+|I_b|^2+|I_c|^2\right)+r_n|I_n|^2"></div>

电流用 A、电阻用 Ω，结果为 W。**不要再次乘三**，式中已经包含三相电流。将支路两端注入的四导线功率相加，也会得到同样的总损耗；应保留中性线导体对应的项。

{% include unbalanced-sequence-theory.html %}

## 3. 例题：总负荷仍为 300 kW，三相分配不同
{: #worked-example }

### 建立馈线与节点设置

考虑一个 **400 V 三节点辐射型配电馈线**。节点 1 是上级电源，经线路 1–2 连接节点 2，再经线路 2–3 连接末端节点 3。每条线路均包含 a、b、c、n 四根导线，本例没有联络线。

{% include unbalanced-feeder.html %}

| 节点 | 设备与指定量 | 电压的处理方式 |
|---|---|---|
| 1 | 平衡电源，线电压 400 V，中性点接地 | 固定三相电压相量与中性点电压 |
| 2 | 星形负荷，A/B/C 各 40 kW，共 120 kW，PF = 0.95 滞后 | 由四线潮流求负荷端电压 |
| 3 | 星形负荷，A/B/C 为 90 / 55 / 35 kW，共 180 kW，PF = 0.95 滞后；另接 50 kW 光伏 | 由四线潮流求负荷端电压 |

节点 3 的光伏采用**固定 P、Q 注入**：基准工况将 50 kW 在三相均分，各相 Q = 0，不调节电压。该节点的逐相净需求由负荷减去光伏注入得到。上方相量图观测的就是此处的相对当地中性点电压。

### 代入基准与线路参数

取三相总容量基准 1 MVA、线电压基准 400 V，得到每相容量基准 333.333 kVA、相电压基准约 230.94 V、Z<sub>B</sub> = 0.16 Ω、I<sub>B</sub> = 1443.38 A。一个 **90 kW 单相负荷**在每相容量基准上为 0.27 pu；90 kW 三相总负荷在三相总容量基准上才是 0.09 pu。

线路每根导线的自阻抗及相间互阻抗如下：

| 支路 | 相线自阻抗（Ω） | 中性线阻抗（Ω） | 相间互阻抗（Ω） |
|---|---|---|---|
| 1–2 | 0.012 + j0.008 | 0.018 + j0.006 | j0.0016 |
| 2–3 | 0.008 + j0.006 | 0.012 + j0.004 | j0.0012 |

### 写出逐相需求并求解

**1. 形成逐相净需求。** 光伏每相供应 50/3 kW，因此节点 3 的净有功需求为 73.333 / 38.333 / 18.333 kW。无功需求仍为 P<sub>D,φ</sub> tan(arccos 0.95)，本例光伏不供应无功。

**2. 求电流与返回路径。** 将复需求除以各自的相对当地中性点电压，再取共轭。把三相电流按复数相量相加，得到中性线返回电流。直接把电流幅值相加会得到错误结果。

**3. 迭代并核对运行点。** 基准例题得到节点 3 的负荷端电压：

| 相 | 幅值（pu） | 幅值（V RMS） | 相角（°） |
|---|---|---|---|
| A | 0.91917 | 212.27 | +0.1180 |
| B | 0.98032 | 226.39 | −122.0550 |
| C | 1.00438 | 231.95 | +121.2865 |

中性点偏移约 **7.637 V**；支路 1–2 的中性线电流约 **242.81 A**。总有功损耗为 **9.5971 kW**，参考电源供应 **259.5971 kW**，满足 259.5971 + 50 − 300 = 9.5971 kW。节点 3 的 VUF 仅为 **0.9028%**，但 A 相已经低于实验中的 0.95 pu 教学限值。

### 把算出的电压分解，再核对重构

**4. 使用同一组复电压。** 将上表的幅值与相角一起转换为复数，再代入序分量矩阵。节点 3 的结果如下；计算使用未舍入的潮流电压，表中仅显示近似值。

| A 相代表系数 | 复数值（pu） | 幅值（pu） | 相角（°） |
|---|---|---|---|
| U₀ · 零序 | −0.040906 + j0.009788 | 0.042061 | +166.543 |
| U₁ · 正序 | 0.967660 − j0.003570 | 0.967666 | −0.211 |
| U₂ · 负序 | −0.007590 − j0.004326 | 0.008736 | −150.322 |

例如 A 相不需要额外旋转，直接把三个代表系数相加：

<div class="bf-equation" data-math="\begin{aligned}U_a&amp;=U_0+U_1+U_2\\&amp;\approx(-0.040906+j0.009788)+(0.967660-j0.003570)+(-0.007590-j0.004326)\\&amp;\approx0.919164+j0.001892\ \mathrm{pu}\end{aligned}"></div>

取幅值与相角就回到约 **0.91917∠0.118° pu**。B、C 相先按逆变换旋转正序和负序项，再相加。下方的分解器可逐相核对，不必另跑一个潮流。

由上表可得 VUF ≈ 0.9028%，但 &#124;U₀&#124;/&#124;U₁&#124; ≈ 4.3466%。这解释了为什么只看 VUF 会遗漏本例明显的零序和逐相电压偏差。这里的 &#124;U₀&#124; ≈ 9.7135 V，而 &#124;Vₙ&#124; ≈ 7.6370 V，两者不是同一个量。

选择下方的**相同总负荷，均分三相**，将节点 3 改为 60 / 60 / 60 kW，保持总负荷与光伏不变。同时观察中性线电流、中性点偏移、逐相电压和损耗。若要精确复现上一章例题，还应把 μ 设为零，使平衡三相看到相同的无互耦串联阻抗。

## 4. 交互实验：改变一相，观察三相
{: #interactive-lab }

拖动各相负荷、切换光伏接入相，或者比较有限与理想中性线。电网图、相量图、电压分布、电流负载率和数值表均使用同一个求解运行点。电压带、VUF 阈值与电流限值是教学设置，不是标准合规评估。

{% include unbalanced-lab.html %}

{% include unbalanced-sequence-lab.html %}

## 5. 修改并运行四线求解器
{: #code-lab }

先看逐相输入怎样进入四线模型，再由 `main()` 调用求解器并读取结果。直接运行默认程序后，取消 `parameters.update(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)` 前的注释，在保持节点 3 总负荷 180 kW 的条件下比较三相电压、VUF 与中性点偏移。滑块保留原始 JavaScript 模型作为参照；Python 区运行可编辑的四线源码。

{% include course-code.html prefix="uf" root_id="unbalanced-code" source="/assets/code/unbalanced_power_flow.py" %}

### 用 Python 验证序分量与重构

把 **main 主程序整体替换**为下面代码。`solve`、`sequence`、`reconstruct_sequence` 都在上方可折叠的完整求解器源码中；它们依次负责潮流求解、相量分解和逆变换。`u_pu` 是 `[实部, 虚部]`，因此要用 `complex(*pair)` 读取，不能把 `vm_pu` 的幅值当成复电压。

```python
def main(input_case):
    # 1. 求解当前滑块工况；失败时不做分解。
    solved = solve(input_case)
    if not solved["ok"]:
        print("Power flow failed:", solved["reason"])
        return solved

    # 2. 读取节点 3 的三相对当地中性点复电压。
    bus = solved["buses"][2]  # zero-based index 2 -> bus 3
    phases = [complex(*phase["u_pu"]) for phase in bus["phases"]]

    # 3. 分解为 A 相代表的零、正、负序系数。
    components = sequence(phases)
    for name in ("zero_pu", "positive_pu", "negative_pu"):
        coefficient = complex(*components[name])
        print(name, coefficient, "|U| =", abs(coefficient), "pu")

    # 4. 逆变换回 ABC，并与原电压逐相比较。
    rebuilt = reconstruct_sequence(components)
    for label, original, recovered in zip("ABC", phases, rebuilt):
        print(label, "solved =", original, "rebuilt =", recovered)
    error = max(abs(u - restored) for u, restored in zip(phases, rebuilt))
    print("Maximum reconstruction error:", error, "pu")

    # 保留完整潮流结果，供页面绘制电压曲线。
    return solved

result = main(case)
```

### 比较光伏接入相

完成默认实验后，可以将主程序整体替换为下面的扫描程序，在其余输入固定时比较光伏接入相。它把最后一次成功求解的结果交给页面绘图：

```python
def main(input_case):
    last_successful = None
    for connection in ("balanced", "a", "b", "c"):
        trial = dict(input_case, dg_phase=connection)
        solved = solve(trial)
        if solved["ok"]:
            end = solved["buses"][2]  # Bus 3
            print(connection, end["components"]["vuf_pct"], end["neutral_v"])
            last_successful = solved
        else:
            print(connection, solved["reason"])
    return last_successful

# 返回 None 时，输出仍可读，页面不绘制电压图。
result = main(case)
```

## 6. 练习与解释
{: #practice }

<form class="bf-quiz uf-quiz"><fieldset><legend>理想中性线设置约束的是什么？</legend><label><input type="radio" name="uf-neutral-quiz" value="voltage"> 中性线导体电压为零，但返回电流仍可能非零。</label><label><input type="radio" name="uf-neutral-quiz" value="current"> 无论如何分配负荷，中性线电流都为零。</label><label><input type="radio" name="uf-neutral-quiz" value="open"> 中性线断开。</label></fieldset><button class="btn" type="submit">检查答案</button><p data-quiz-feedback role="status" aria-live="polite"></p></form>

1. **中性线耦合：** 设置 μ = 0，保持有限中性线阻抗，将 A 相负荷增加 10 kW，记录三相电压。再采用理想中性线重复，用共享中性线矩阵项解释差别。
2. **总需求相同：** 比较 90 / 55 / 35 kW 与 60 / 60 / 60 kW，保持功率因数、光伏出力与接入方式、阻抗不变。解释中性线损耗与最低电压的变化。
3. **一个指标不够：** 找到 VUF 小于 2%，但某相电压超出 0.95–1.05 pu 的收敛运行点。用 U₀、U₂ 和中性点偏移讨论 VUF 的含义与局限。
4. **单相光伏：** 将 50 kW 依次接在 A、B、C 相，判断在当前运行点哪个方案更能改善最低电压，再在高负荷时重复。不要预先假设所有工况的最佳接入相都相同。
5. **N-1 标签：** 断开支路 2–3，区分孤岛、算法不收敛、以及连通但越限的状态。固定 PQ 光伏不会在馈线断开后自动成为构网电源。

6. **序分量与参考：** 先选电源节点，解释为何只剩正序。再选基准工况的末端节点，切换 U 与 V，核对 U₀ = V₀ − Vₙ。分别重构 A、B、C，相角旋转系数为什么不同？

## 7. 适用范围与后续实现

本章是基波、辐射型教学模型，不包含三角形负荷、电压相关负荷、不对称导线几何、相线与中性线互阻抗、下游接地与大地回流、变压器、调压器、谐波、逆变器能力限值或动态与保护行为。支路断开时四根导线同时断开，没有建模仅中性线断开的故障。孤岛在本模型中没有电压参考。

在 [PandaPower-based Implementation]({{ '/zh/teaching/course-development/physics-informed-gnn/pandapower-based-implementation/' | relative_url }}) 中，我们将设备映射到库函数，并明确比较工具的建模假设。[pandapower `runpp_3ph` 文档](https://pandapower.readthedocs.io/en/v3.2.1/powerflow/ac_3ph.html)说明了序域求解和大地回流、星形连接约定。在匹配这些假设之前，不应认为其结果会与本章显式中性线模型一致。

### 参考资料

* [Claeys、Geth、Deconinck：四线配电网络建模](https://arxiv.org/abs/2204.08126)。
* [OpenDSS：中性线连接约定](https://opendss.epri.com/NeutralRules.html)。
* [OpenDSS：基于幅值偏差的 NEMA 不平衡指标](https://opendss.epri.com/TechNoteNEMAUnbalanceCalculation.html)。
* [pandapower：三相不平衡潮流](https://pandapower.readthedocs.io/en/stable/powerflow/ac_3ph.html)。
