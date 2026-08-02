# frozen_string_literal: true

require "date"
require "pathname"
require "yaml"

SITE_ROOT = Pathname(__dir__).parent
RESEARCH_OS = Pathname(ARGV.fetch(0) do
  abort "Usage: ruby scripts/export_research_publications.rb /path/to/ResearchOS"
end).expand_path
OUTPUT = SITE_ROOT.join("_data/research_publications.yml")

THEME_KEYS = {
  "THM-001" => "ibr-dynamics",
  "THM-002" => "dynamic-decisions",
  "THM-003" => "operating-boundaries",
  "THM-004" => "resilience-security",
  "THM-005" => "trustworthy-ai",
  "THM-006" => "decision-intelligence",
  "THM-007" => "engineering-agents",
  "THM-008" => "ai-infrastructure"
}.freeze

# This export mirrors the 60 entries currently listed on the website's
# Publications page. Site-specific additions preserve the user's explicit
# cross-theme classification without changing ResearchOS relationships.
# PFAgent (WRK-004) is intentionally included and selected as a representative
# public preprint at the user's request; this snapshot makes no lifecycle claim.
SITE_THEME_ADDITIONS = {
  "WRK-040" => ["decision-intelligence"]
}.freeze

# The Publications page groups online-first records by the year shown there.
# Preserve that user-facing convention in the Research page snapshot.
PUBLICATION_YEAR_OVERRIDES = {
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

VENUE_OVERRIDES = {
  "WRK-004" => "arXiv preprint",
  "WRK-017" => "arXiv preprint",
  "WRK-027" => "U.S. Patent"
}.freeze

ORIGINAL_LANGUAGE_TITLES = {
  "WRK-050" => "配电网安全域的特殊二维图像：发现、机理及用途",
  "WRK-051" => "配电网安全域的全维直接观测",
  "WRK-052" => "基于文献综述的配电网供电能力术语规范化建议",
  "WRK-054" => "配电网的供电能力曲线和消纳能力曲线",
  "WRK-055" => "配电网供电能力曲线的规律与机理",
  "WRK-056" => "配电网接线模式的综合效率评价",
  "WRK-057" => "部分元件 N-1 下的配电网供电能力与安全域",
  "WRK-058" => "配电网安全域的 N×N 形式维度",
  "WRK-060" => "配电网的供电能力分布"
}.freeze

def front_matter(path)
  source = path.read
  payload = source.split(/^---\s*$\n/, 3)[1]
  abort "Missing YAML front matter: #{path}" unless payload

  YAML.safe_load(payload, permitted_classes: [Date], aliases: false)
end

def wikilink_target(value)
  value.to_s[/\[\[([^\]|]+)/, 1]
end

problems = {}
RESEARCH_OS.join("30-problems").glob("PRB-*.md").each do |path|
  problems[path.basename(".md").to_s] = front_matter(path)
end

works = RESEARCH_OS.join("40-works").glob("WRK-*.md").filter_map do |path|
  work = front_matter(path)
  number = work.fetch("id").delete_prefix("WRK-").to_i
  next unless (1..60).cover?(number)

  problem_ids = [work["parent"], *Array(work["contributes_to"])]
    .compact
    .map { |value| wikilink_target(value) }

  theme_ids = problem_ids.filter_map do |problem_id|
    problem = problems[problem_id]
    next unless problem

    theme_link = wikilink_target(problem["parent"])
    THEME_KEYS[theme_link&.slice(/THM-\d+/)]
  end

  theme_ids.concat(SITE_THEME_ADDITIONS.fetch(work.fetch("id"), []))
  theme_ids.uniq!

  doi = work["doi"].to_s.strip
  external_link = Array(work["output_links"]).find { |link| link.to_s.start_with?("http") }
  year = PUBLICATION_YEAR_OVERRIDES.fetch(work.fetch("id"), work.fetch("publication_year").to_s)
  url = if !doi.empty?
          "https://doi.org/#{doi}"
        elsif external_link == "https://shebuxin.github.io/publications/"
          "/publications/##{year}"
        else
          external_link
        end
  abort "Missing public link: #{work.fetch('id')}" unless url
  abort "Missing research theme: #{work.fetch('id')}" if theme_ids.empty?

  title = ORIGINAL_LANGUAGE_TITLES.fetch(work.fetch("id"), work.fetch("title"))

  {
    "id" => work.fetch("id"),
    "title" => title,
    "title_language" => title.match?(/[\p{Han}]/) ? "zh" : "en",
    "year" => year,
    "venue" => VENUE_OVERRIDES.fetch(work.fetch("id"), work.fetch("venue")),
    "url" => url,
    "theme_ids" => theme_ids
  }
end

expected_ids = (1..60).map { |number| format("WRK-%03d", number) }
actual_ids = works.map { |work| work.fetch("id") }
missing_ids = expected_ids - actual_ids
extra_ids = actual_ids - expected_ids
abort "Unexpected export scope; missing=#{missing_ids.inspect}, extra=#{extra_ids.inspect}" unless missing_ids.empty? && extra_ids.empty?

works.sort_by! { |work| [-work.fetch("year").to_i, work.fetch("id")] }

header = <<~HEADER
  # Generated from ResearchOS by scripts/export_research_publications.rb.
  # This public snapshot intentionally excludes internal lifecycle/status fields.
HEADER
OUTPUT.write(header + YAML.dump(works))
puts "Exported #{works.size} research publications to #{OUTPUT.relative_path_from(SITE_ROOT)}"
