---
layout: archive
title: "Research"
permalink: /research/
author_profile: true
header:
  og_image: "research/ecdf.png"
---
My research interests lie in control, optimization and machine learning for power systems.

Specificlly, the topics include microgrid control, security-constrained economic dispatch, and distribution system operation and plan.

---

## Microgrid control, IBR control

I have worked on P-Q control, V-f control, transient-stability guaranteed control, and HVDC damping control.

* **Inverter PQ Control with Trajectory Tracking Capability**

  I designed a P-Q controller for microgrid grid-following inverters with trajectory tracking capability, based on physics-informed reinforcement learning. By tuning the PI gains in real-time, the inverter output can perfectly track the predefined exponential trajectories with any time constant. I performed model-based analysis first, and then implemented the twin delayed deeper deterministic policy gradient algorithm (a model-free deep RL algorithm). The proposed algorithm was finally tested on [CURENT](https://curent.utk.edu/files/8414/8709/3719/Tolbert_Fact_Sheet_Web.pdf.

* [**Decentralized and Cooperated V-f Control**](https://ieeexplore.ieee.org/document/10078029)

  I proposed a V-f control framework for islanded microgrids, with full consideration of DER inadequacy and demand control. The control framework regulates the output of each grid-forming inverter accurately and thus improves the inverter DC side stability caused by DER inadequacy.

* [**Fusion of Model-free Reinforcement Learning (MFRL) with Microgrid Contro**](https://ieeexplore.ieee.org/document/9951405)

  I wrote a review paper to summarize how MFRL can be integrated into the existing microgrid control framework. The contributions include: 1)Plotting of a high-level research map of microgrid control; 2) Development of modularized control blocks to dive into grid-following and grid-forming inverters; 3) Introduction of the mainstream MFRL algorithms and summary of MFRL application guidelines; 4) Discussion of the primary challenges associated with adopting MFRL in microgrid control and providing insights for addressing these concerns.

* [**Microgrid Controller Design with Certified Stability and Domain of Attraction**]

  I developed a systematic controller design approach that integrates the analytical transient stability conditions to guarantee the domain of attraction, based on nonlinear state-space modeling (electromagnetic transient modeling) of islanded microgrids. *This work was done during my internship at Argonne National Laboratory under the supervision of [Dr. Jianzhe Liu](https://www.anl.gov/profile/jianzhe-liu).*


* [**Time Delay Compensation of HVDC Damping Control**](https://www.frontiersin.org/articles/10.3389/fenrg.2022.895163/full)

  I proposed a data-driven delay compensation approach for wide-area damping control (WADC), leveraging the modern recurrent neural network LSTM. A small signal model of WADC with time delay is formulated to analyze the impacts of time delay on WADC. It is mathematically proven that uncorrected PUM signals can result in the instability of urban power grids.


---

## Security-constrained economic dispatch

I have worked on the security-constrained economic dispatch of IBR-based microgrid/power system.

* **Security-constrained real-time economic dispatch**

  I proposed the concept of virtual inertia scheduling (VIS) for IBR-dominant power systems. VIS is an inertia management framework that targets security-constrained and economy-oriented inertia scheduling and generation dispatch of power systems with a large scale of renewable generations. Specifically, it schedules the proper power setting points and reserved capacities of both synchronous generators and IBRs, as well as the control modes and control parameters of IBRs to provide secure and cost-effective inertia support.

* **VIS with certified stability and dynamic performance under N-1 Contingency**

  I plan to extend the concept of VIS to microgrids under N-1 contingency, while also certifying the transient stability and dynamic performance.

---

## Distribution system operation and plan

I worked on the plan and operation of distribution system under the supervision of Dr.Jun Xiao at Tianjin University.



---

## Thermal Energy Storage

I participated in research led by ORNL research scientist [Dr. Zhenglai Shen](https://www.ornl.gov/staff-profile/zhenglai-shen) and his manager [Dr. Som S Shrestha](https://www.ornl.gov/staff-profile/som-s-shrestha).


<!-- <nbsp>

{% include base_path %}

{% assign ordered_pages = site.research | sort:"order_number" %}

{% for post in ordered_pages %}
  {% include archive-single.html type="grid" %}
{% endfor %} -->
