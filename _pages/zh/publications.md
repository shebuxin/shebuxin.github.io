---
layout: archive
title: "学术成果"
permalink: /zh/publications/
author_profile: true
lang: zh
description: "佘步鑫的期刊论文、会议论文、技术报告、专利与学位论文，按年份汇总。"
---

以下成果按年份列出。论文及其他出版物的正式标题保留其原始发表语言。

{% assign english_publications = site.pages | where: "permalink", "/publications/" | first %}
{% assign publication_content = english_publications.content | replace: "**US Patent**", "**美国专利**" | replace: "Inventors:", "发明人：" | replace: "PhD dissertation", "博士学位论文" %}
{{ publication_content | markdownify }}
