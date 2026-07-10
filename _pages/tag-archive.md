---
layout: archive
title: "Posts by Tag"
permalink: /tags/
author_profile: true
---

{% assign tags = site.tags | sort %}
{% if tags.size > 0 %}
  {% for tag in tags %}
<section id="{{ tag[0] | slugify }}" class="taxonomy__section">
  <h2>{{ tag[0] }}</h2>
    {% for post in tag[1] %}
    {% include archive-single.html %}
    {% endfor %}
</section>
  {% endfor %}
{% else %}
No tagged posts are available yet.
{% endif %}
