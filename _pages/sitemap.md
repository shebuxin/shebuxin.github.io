---
layout: archive
title: "Sitemap"
permalink: /sitemap/
author_profile: true
---

{% include base_path %}

A list of all the posts and pages found on the site. For you robots out there is an [XML version]({{ base_path }}/sitemap.xml) available for digesting as well.

<h2>Pages</h2>
{% assign human_pages = site.pages | sort: "title" %}
{% for post in human_pages %}
  {% if post.lang != "zh" and post.title and post.url != page.url and post.sitemap != false and post.layout != "redirect" and post.redirect_to == nil %}
  {% include archive-single.html %}
  {% endif %}
{% endfor %}

{% if site.posts.size > 0 %}
<h2>Posts</h2>
  {% for post in site.posts %}
    {% if post.lang != "zh" %}
  {% include archive-single.html %}
    {% endif %}
  {% endfor %}
{% endif %}

{% for collection in site.collections %}
  {% if collection.output != false and collection.label != "posts" and collection.docs.size > 0 %}
  <h2>{{ collection.label | capitalize }}</h2>
    {% for post in collection.docs %}
      {% if post.lang != "zh" %}
    {% include archive-single.html %}
      {% endif %}
    {% endfor %}
  {% endif %}
{% endfor %}
