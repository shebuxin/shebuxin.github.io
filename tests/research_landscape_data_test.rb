# frozen_string_literal: true

require "minitest/autorun"
require "yaml"

class ResearchLandscapeDataTest < Minitest::Test
  DATA_PATH = File.expand_path("../_data/research_landscape.yml", __dir__)
  PUBLICATIONS_PATH = File.expand_path("../_data/research_publications.yml", __dir__)

  REPRESENTATIVE_WORKS = {
    "ibr-dynamics" => "WRK-029",
    "operating-boundaries" => "WRK-038",
    "dynamic-decisions" => "WRK-030",
    "resilience-security" => "WRK-002",
    "trustworthy-ai" => "WRK-031",
    "engineering-agents" => "WRK-004",
    "decision-intelligence" => "WRK-040",
    "ai-infrastructure" => "WRK-003"
  }.freeze

  EXPECTED_THEME_COUNTS = {
    "ibr-dynamics" => 18,
    "operating-boundaries" => 24,
    "dynamic-decisions" => 13,
    "resilience-security" => 8,
    "trustworthy-ai" => 6,
    "engineering-agents" => 1,
    "decision-intelligence" => 5,
    "ai-infrastructure" => 2
  }.freeze

  PUBLICATION_PAGE_YEARS = {
    "WRK-016" => "2024",
    "WRK-018" => "2024",
    "WRK-020" => "2024",
    "WRK-022" => "2024",
    "WRK-027" => "2024",
    "WRK-029" => "2023",
    "WRK-030" => "2023",
    "WRK-031" => "2023",
    "WRK-033" => "2023",
    "WRK-034" => "2023",
    "WRK-040" => "2022"
  }.freeze

  def setup
    @data = YAML.safe_load(File.read(DATA_PATH), permitted_classes: [], aliases: false)
    @publications = YAML.safe_load(File.read(PUBLICATIONS_PATH), permitted_classes: [], aliases: false)
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

  def test_themes_have_bilingual_content_and_requested_representatives
    @themes.each do |theme_id, theme|
      assert_match(/\ATHM-\d{3}\z/, theme.fetch("source_id"))
      assert @visions.key?(theme.fetch("vision")), "#{theme_id} has an invalid vision"
      assert_localized_text(theme.fetch("title"))
      assert_localized_text(theme.fetch("short_title"))
      assert_localized_text(theme.fetch("summary"))
      assert_localized_list(theme.fetch("keywords"))

      refute_empty theme.fetch("questions")
      theme.fetch("questions").each { |question| assert_localized_text(question) }

      representative_id = theme.fetch("representative_work")
      assert_equal REPRESENTATIVE_WORKS.fetch(theme_id), representative_id
      representative = @publications.find { |work| work.fetch("id") == representative_id }
      refute_nil representative, "#{theme_id} references missing representative #{representative_id}"
      assert_includes representative.fetch("theme_ids"), theme_id
    end
  end

  def test_all_website_publications_are_classified_without_lifecycle_fields
    assert_equal 60, @publications.size
    expected_ids = (1..60).map { |number| format("WRK-%03d", number) }
    assert_equal expected_ids.sort, @publications.map { |work| work.fetch("id") }.sort

    @publications.each do |work|
      assert_match(/\AWRK-\d{3}\z/, work.fetch("id"))
      refute_empty work.fetch("title")
      assert_includes %w[en zh], work.fetch("title_language")
      assert_match(/\A\d{4}\z/, work.fetch("year"))
      refute_empty work.fetch("venue")
      assert_match(%r{\A(?:https://|/publications/#\d{4}\z)}, work.fetch("url"))
      refute_empty work.fetch("theme_ids")
      assert_equal work.fetch("theme_ids").uniq, work.fetch("theme_ids")
      work.fetch("theme_ids").each do |theme_id|
        assert @themes.key?(theme_id), "#{work.fetch('id')} references missing theme #{theme_id}"
      end
      %w[status publication_state health].each do |private_key|
        refute work.key?(private_key), "#{work.fetch('id')} exposes private lifecycle field #{private_key}"
      end
    end


    PUBLICATION_PAGE_YEARS.each do |work_id, year|
      work = @publications.find { |publication| publication.fetch("id") == work_id }
      assert_equal year, work.fetch("year")
    end
    patent = @publications.find { |publication| publication.fetch("id") == "WRK-027" }
    assert_equal "U.S. Patent", patent.fetch("venue")
    pfagent = @publications.find { |publication| publication.fetch("id") == "WRK-004" }
    assert_equal "arXiv preprint", pfagent.fetch("venue")
    assert_equal "https://arxiv.org/abs/2604.10846", pfagent.fetch("url")
    assert_equal 8, @publications.count { |work| work.fetch("url").start_with?("/publications/#") }

    actual_counts = @themes.to_h do |theme_id, _theme|
      count = @publications.count { |work| work.fetch("theme_ids").include?(theme_id) }
      [theme_id, count]
    end
    assert_equal EXPECTED_THEME_COUNTS, actual_counts
  end

  def test_public_status_labels_are_not_exposed
    labels = @data.fetch("labels")
    refute labels.key?("published")
    assert_localized_text(labels.fetch("representative_work"))
    assert_localized_text(labels.fetch("related_publications"))
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
