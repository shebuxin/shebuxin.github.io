---
layout: archive
title: "Posts by Category"
permalink: /categories/
author_profile: true
---

{% assign categories = site.categories | sort %}
{% if categories.size > 0 %}
  {% for category in categories %}
<section id="{{ category[0] | slugify }}" class="taxonomy__section">
  <h2>{{ category[0] }}</h2>
    {% for post in category[1] %}
    {% include archive-single.html %}
    {% endfor %}
</section>
  {% endfor %}
{% else %}
No categorized posts are available yet.
{% endif %}
