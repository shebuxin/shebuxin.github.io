# frozen_string_literal: true

require "minitest/autorun"
require "yaml"

class ResearchLandscapeDataTest < Minitest::Test
  DATA_PATH = File.expand_path("../_data/research_landscape.yml", __dir__)

  def setup
    @data = YAML.safe_load(File.read(DATA_PATH), permitted_classes: [], aliases: false)
    @visions = @data.fetch("visions")
    @themes = @data.fetch("themes")
  end

  def test_portfolio_shape_and_order
    assert_equal 2, @visions.size
    assert_equal 8, @themes.size
    assert_equal @visions.keys.sort, @data.fetch("vision_order").sort
    assert_equal @themes.keys.sort, @data.fetch("theme_order").sort
  end

  def test_visions_reference_valid_themes
    @visions.each do |vision_id, vision|
      assert_match(/\AVIS-\d{3}\z/, vision.fetch("source_id"))
      assert_localized_text(vision.fetch("title"))
      assert_localized_text(vision.fetch("short_title"))
      assert_localized_text(vision.fetch("summary"))

      vision.fetch("theme_ids").each do |theme_id|
        assert @themes.key?(theme_id), "#{vision_id} references missing theme #{theme_id}"
        assert_equal vision_id, @themes.fetch(theme_id).fetch("vision")
      end
    end
  end

  def test_themes_have_bilingual_public_content
    @themes.each do |theme_id, theme|
      assert_match(/\ATHM-\d{3}\z/, theme.fetch("source_id"))
      assert @visions.key?(theme.fetch("vision")), "#{theme_id} has an invalid vision"
      assert_localized_text(theme.fetch("title"))
      assert_localized_text(theme.fetch("short_title"))
      assert_localized_text(theme.fetch("summary"))
      assert_localized_list(theme.fetch("keywords"))

      refute_empty theme.fetch("questions")
      theme.fetch("questions").each { |question| assert_localized_text(question) }

      refute_empty theme.fetch("evidence")
      theme.fetch("evidence").each do |work|
        assert_match(/\AWRK-\d{3}\z/, work.fetch("source_id"))
        refute_empty work.fetch("title")
        refute_empty work.fetch("venue")
        assert_match(/\A\d{4}\z/, work.fetch("year"))
        assert_match(%r{\Ahttps://}, work.fetch("url"))
        assert_localized_text(work.fetch("note")) if work.key?("note")
        %w[status publication_state health].each do |private_key|
          refute work.key?(private_key), "#{theme_id} exposes private lifecycle field #{private_key}"
        end
      end
    end
  end

  def test_logic_targets_exist
    referenced_theme_ids = []

    @data.fetch("logic").each do |step|
      assert_localized_text(step.fetch("title"))
      assert_localized_text(step.fetch("description"))
      step.fetch("theme_ids").each do |theme_id|
        assert @themes.key?(theme_id), "Logic step references missing theme #{theme_id}"
        referenced_theme_ids << theme_id
      end
    end

    assert_empty @themes.keys - referenced_theme_ids.uniq,
                 "Every theme should appear in the research logic"
  end

  def test_calls_to_action_are_bilingual_and_safe
    @data.fetch("calls_to_action").each do |action|
      assert_localized_text(action.fetch("label"))
      %w[en zh].each do |language|
        url = action.fetch("url").fetch(language)
        assert url.start_with?("/", "mailto:"), "Unexpected action URL: #{url}"
      end
    end
  end

  private

  def assert_localized_text(value)
    %w[en zh].each do |language|
      assert value.key?(language), "Missing #{language} text"
      refute_empty value.fetch(language).to_s.strip
    end
  end

  def assert_localized_list(value)
    %w[en zh].each do |language|
      assert value.key?(language), "Missing #{language} list"
      refute_empty value.fetch(language)
      value.fetch(language).each { |item| refute_empty item.to_s.strip }
    end
  end
end
