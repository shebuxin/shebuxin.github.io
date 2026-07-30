---
layout: archive
title: "按分类浏览文章"
permalink: /zh/categories/
author_profile: true
lang: zh
description: "按主题分类浏览本站的中文文章。"
---

{% assign categories = site.categories | sort %}
{% assign has_chinese_categories = false %}
{% for category in categories %}
  {% assign chinese_posts = category[1] | where: "lang", "zh" %}
  {% if chinese_posts.size > 0 %}
    {% assign has_chinese_categories = true %}
<section id="{{ category[0] | slugify }}" class="taxonomy__section">
  <h2>{{ category[0] }}</h2>
    {% for post in chinese_posts %}
    {% include archive-single.html %}
    {% endfor %}
</section>
  {% endif %}
{% endfor %}
{% unless has_chinese_categories %}
暂时还没有已分类的中文文章。
{% endunless %}
