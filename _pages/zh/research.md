---
layout: archive
title: "研究"
permalink: /zh/research/
description: "佘步鑫在现代电力系统控制、优化、机器学习、稳定性与韧性运行方面的研究。"
lang: zh
author_profile: true
header:
  og_image: "research/ecdf.png"
---
我的研究聚焦于现代电力系统的控制、优化与机器学习，重点关注基于逆变器的资源、系统动态特性和电网韧性运行。

目前的研究主题包括微电网与 IBR 控制、安全约束调度、配电系统运行与规划，以及信息物理系统韧性。

---

## 微电网与 IBR 控制

我在 P-Q 控制、V-f 控制、具有暂态稳定性保证的控制器设计，以及高压直流输电（HVDC）阻尼控制等方向开展了研究。

* [**Inverter PQ Control with Trajectory Tracking Capability**](https://ieeexplore.ieee.org/abstract/document/10128154)

  我采用物理信息强化学习，为微电网中的跟网型逆变器设计了具有轨迹跟踪能力的 P-Q 控制器。通过实时调整 PI 参数，逆变器输出可沿预先设定的指数轨迹变化，并满足用户指定的时间常数。该方法将基于模型的分析与双延迟深度确定性策略梯度算法相结合，并在 [CURENT 硬件试验平台](https://curent.utk.edu/wp-content/uploads/2024/07/Tolbert_Fact_Sheet_Web.pdf)上完成了验证。
* [**Decentralized and Cooperated V-f Control**](https://ieeexplore.ieee.org/document/10078029)

  我提出了一套适用于孤岛微电网的 V-f 控制框架，显式考虑分布式能源（DER）供能不足和需求侧控制。该框架能够对每台构网型逆变器进行精确调节，并在资源短缺时提升直流侧稳定性。
* [**Fusion of Model-free Reinforcement Learning (MFRL) with Microgrid Control**](https://ieeexplore.ieee.org/document/9951405)

  我撰写了一篇综述论文，系统讨论如何将无模型强化学习融入成熟的微电网控制框架。该论文梳理了相关研究版图，解析跟网型与构网型逆变器的控制架构，总结主流 MFRL 算法，并探讨这些方法走向实际应用所面临的主要障碍。
* [**Microgrid Controller Design with Certified Stability and Domain of Attraction**](https://ieeexplore.ieee.org/abstract/document/10310265)

  基于孤岛微电网的非线性电磁暂态模型，我开发了一种系统化控制器设计方法，将解析的暂态稳定条件纳入设计过程，从而保证系统吸引域。*该研究完成于我在阿贡国家实验室实习期间，由 [Jianzhe Liu 博士](https://www.anl.gov/profile/jianzhe-liu)指导。*
* [**Time Delay Compensation of HVDC Damping Control**](https://www.frontiersin.org/articles/10.3389/fenrg.2022.895163/full)

  我提出了一种面向广域阻尼控制的数据驱动时延补偿方法，采用基于 LSTM 的循环神经网络。研究建立了包含通信时延的小信号模型，用于量化时延影响，并揭示未经校正的 PMU 信号如何导致城市电网失稳。

---

## 安全约束经济调度

我开展了面向 IBR 微电网和大规模电力系统的安全约束经济调度研究。

* [**Virtual Inertia Scheduling (VIS) for IBR-penetrated Power System**](https://ieeexplore.ieee.org/abstract/document/10264213)

  我提出了适用于 IBR 主导电力系统的虚拟惯量调度（Virtual Inertia Scheduling, VIS）概念。VIS 是一种惯量管理框架，可在安全与经济约束下联合调度发电和惯量支撑，并为同步发电机与 IBR 协同确定有功功率设定值、备用容量、控制模式和控制参数。
* [**Microgrid VIS with certified stability and dynamic performance**](https://doi.org/10.1109/TSTE.2024.3481239)

  我将 VIS 扩展至微电网，在充分利用 IBR 可控性与灵活性的同时，对暂态稳定性、小信号稳定性和动态性能进行验证与保障。此外，我还建立了通过数据生成、清洗和标注，将数据驱动方法融入微电网 VIS 的工作流程。

---

## 配电系统运行与规划

在天津大学 Jun Xiao 博士的指导下，我开展了配电系统规划与运行研究。

---

## 热储能

我参与了由橡树岭国家实验室研究科学家 [Zhenglai Shen 博士](https://www.ornl.gov/staff-profile/zhenglai-shen)及其主管 [Som S Shrestha 博士](https://www.ornl.gov/staff-profile/som-s-shrestha)负责的相关研究。
