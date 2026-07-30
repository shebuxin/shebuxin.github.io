---
layout: archive
title: "网站地图"
permalink: /zh/sitemap/
author_profile: true
lang: zh
description: "本网站全部中文页面与中文文章的索引。"
---

{% include base_path %}

这里汇总了本站的中文页面与中文文章。搜索引擎也可使用 [XML 版本]({{ base_path }}/sitemap.xml)抓取本站内容。

<h2>页面</h2>
{% assign human_pages = site.pages | where: "lang", "zh" | sort: "title" %}
{% for post in human_pages %}
  {% if post.title and post.url != page.url and post.sitemap != false and post.layout != "redirect" and post.redirect_to == nil %}
  {% include archive-single.html %}
  {% endif %}
{% endfor %}

{% assign chinese_posts = site.posts | where: "lang", "zh" %}
{% if chinese_posts.size > 0 %}
<h2>文章</h2>
  {% for post in chinese_posts %}
    {% if post.url != page.url and post.sitemap != false and post.layout != "redirect" and post.redirect_to == nil %}
    {% include archive-single.html %}
    {% endif %}
  {% endfor %}
{% endif %}

{% for collection in site.collections %}
  {% assign chinese_docs = collection.docs | where: "lang", "zh" %}
  {% if collection.output != false and collection.label != "posts" and chinese_docs.size > 0 %}
  <h2>{{ collection.label }}</h2>
    {% for post in chinese_docs %}
      {% if post.url != page.url and post.sitemap != false and post.layout != "redirect" and post.redirect_to == nil %}
      {% include archive-single.html %}
      {% endif %}
    {% endfor %}
  {% endif %}
{% endfor %}
