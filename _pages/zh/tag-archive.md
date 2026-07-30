---
layout: archive
title: "按标签浏览文章"
permalink: /zh/tags/
author_profile: true
lang: zh
description: "按标签浏览本站的中文文章。"
---

{% assign tags = site.tags | sort %}
{% assign has_chinese_tags = false %}
{% for tag in tags %}
  {% assign chinese_posts = tag[1] | where: "lang", "zh" %}
  {% if chinese_posts.size > 0 %}
    {% assign has_chinese_tags = true %}
<section id="{{ tag[0] | slugify }}" class="taxonomy__section">
  <h2>{{ tag[0] }}</h2>
    {% for post in chinese_posts %}
    {% include archive-single.html %}
    {% endfor %}
</section>
  {% endif %}
{% endfor %}
{% unless has_chinese_tags %}
暂时还没有带标签的中文文章。
{% endunless %}
