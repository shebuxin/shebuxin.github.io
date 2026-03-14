---
layout: archive
title: "Research"
permalink: /research/
author_profile: true
header:
  og_image: "research/ecdf.png"
---
My research focuses on control, optimization, and machine learning for modern power systems, with an emphasis on inverter-based resources, system dynamics, and resilient grid operation.

Current topics include microgrid and IBR control, security-constrained scheduling, distribution system operation and planning, and cyber-physical resilience.

---

## Microgrid and IBR control

I have worked on P-Q control, V-f control, controller design with transient-stability guarantees, and HVDC damping control.

* [**Inverter PQ Control with Trajectory Tracking Capability**](https://ieeexplore.ieee.org/abstract/document/10128154)

  I designed a P-Q controller for grid-following inverters in microgrids with trajectory-tracking capability using physics-informed reinforcement learning. By tuning PI gains in real time, the inverter output can follow predefined exponential trajectories with user-specified time constants. The approach combines model-based analysis with the twin delayed deep deterministic policy gradient algorithm and was validated on the [CURENT hardware testbed](https://curent.utk.edu/files/8414/8709/3719/Tolbert_Fact_Sheet_Web.pdf).
* [**Decentralized and Cooperated V-f Control**](https://ieeexplore.ieee.org/document/10078029)

  I proposed a V-f control framework for islanded microgrids that explicitly accounts for DER inadequacy and demand control. The framework regulates each grid-forming inverter accurately and improves DC-side stability under resource scarcity.
* [**Fusion of Model-free Reinforcement Learning (MFRL) with Microgrid Control**](https://ieeexplore.ieee.org/document/9951405)

  I wrote a review article on how model-free reinforcement learning can be integrated into established microgrid control frameworks. The paper maps the research landscape, breaks down control architectures for grid-following and grid-forming inverters, summarizes mainstream MFRL algorithms, and discusses the main barriers to practical adoption.
* [**Microgrid Controller Design with Certified Stability and Domain of Attraction**](https://ieeexplore.ieee.org/abstract/document/10310265)

  I developed a systematic controller design method that incorporates analytical transient-stability conditions to guarantee a domain of attraction, using nonlinear electromagnetic-transient models of islanded microgrids. *This work was completed during my internship at Argonne National Laboratory under the supervision of [Dr. Jianzhe Liu](https://www.anl.gov/profile/jianzhe-liu).*
* [**Time Delay Compensation of HVDC Damping Control**](https://www.frontiersin.org/articles/10.3389/fenrg.2022.895163/full)

  I proposed a data-driven delay-compensation approach for wide-area damping control using LSTM-based recurrent neural networks. A small-signal model with communication delay was developed to quantify delay impacts and to show how uncorrected PMU signals can destabilize urban power grids.

---

## Security-constrained economic dispatch

I have worked on security-constrained economic dispatch for IBR-based microgrids and bulk power systems.

* [**Virtual Inertia Scheduling (VIS) for IBR-penetrated Power System**](https://ieeexplore.ieee.org/abstract/document/10264213)

  I proposed the concept of virtual inertia scheduling (VIS) for IBR-dominant power systems. VIS is an inertia-management framework for jointly scheduling generation and inertia support under security and economic constraints. It determines power setpoints, reserve capacities, control modes, and control parameters for both synchronous generators and IBRs.
* [**Microgrid VIS with certified stability and dynamic performance**](https://ltb.curent.org/showcase/microvis/)

  I extended VIS to microgrids to better use the controllability and flexibility of IBRs while certifying transient stability, small-signal stability, and dynamic performance. I also developed a workflow for integrating data-driven methods into microgrid VIS through data generation, cleaning, and labeling.

---

## Distribution system operation and plan

I worked on planning and operation of distribution systems under the supervision of Dr. Jun Xiao at Tianjin University.

---

## Thermal Energy Storage

I participated in research led by ORNL research scientist [Dr. Zhenglai Shen](https://www.ornl.gov/staff-profile/zhenglai-shen) and his manager [Dr. Som S Shrestha](https://www.ornl.gov/staff-profile/som-s-shrestha).
