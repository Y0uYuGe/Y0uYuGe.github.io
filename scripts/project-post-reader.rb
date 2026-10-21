# frozen_string_literal: true

# Local preview only: Jekyll 3.10 expands **/* before applying excludes. Stop at
# independent project roots so their source/archive paths are never enumerated.
require 'json'
require 'set'
require 'yaml'

module ProjectPostReader
  SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'
  PROJECT_ROOT = %r{\A_posts/(?:#{SLUG}/)+#{SLUG}\z}
  ARTICLE = /\A\d{4}-\d{2}-\d{2}-#{SLUG}\.md\z/

  def get_entries(dir, subfolder)
    base = site.in_source_dir(dir, subfolder)
    return super unless base == site.in_source_dir('_posts')
    return [] unless File.exist?(base)

    roots, approved = project_post_rules
    entries = []
    directories = ['']
    until directories.empty?
      relative_directory = directories.pop
      Dir.children(File.join(base, relative_directory)).each do |name|
        # Dir['**/*'] never enters or returns dot paths without FNM_DOTMATCH.
        next if name.start_with?('.')
        relative = relative_directory.empty? ? name : File.join(relative_directory, name)
        absolute = File.join(base, relative)
        if File.symlink?(absolute)
          # Preserve ordinary file-link filtering, but never walk link targets.
          entries << relative
        elsif roots.include?(relative)
          # Never call Dir.children/glob on a managed repository, even when all
          # of its files would eventually be excluded by Jekyll.
          approved.fetch(relative, []).each do |article|
            entries << article if File.file?(File.join(base, article))
          end
        else
          entries << relative
          directories << relative if File.directory?(absolute)
        end
      end
    end

    # EntryFilter's symlink checks resolve relative paths against this CWD.
    Dir.chdir(base) do
      filter_entries(entries, base)
        .reject { |entry| File.directory?(site.in_source_dir(base, entry)) }.sort
    end
  end

  private

  def project_post_rules
    manifest_path = site.in_source_dir('_data/project-workspaces.json')
    config_path = site.in_source_dir('local/project-docs-config.yml')
    manifest = JSON.parse(File.read(manifest_path, :encoding => 'bom|utf-8'))
    unless manifest.is_a?(Hash) && manifest['version'] == 1 && manifest['projects'].is_a?(Array)
      raise ArgumentError, 'Invalid project workspace manifest'
    end
    roots = manifest['projects'].map do |project|
      path = project.is_a?(Hash) && project['path']
      raise ArgumentError, 'Invalid managed project path' unless path.is_a?(String) && path.match?(PROJECT_ROOT)
      path.delete_prefix('_posts/')
    end.to_set
    rules = YAML.safe_load(File.read(config_path, :encoding => 'bom|utf-8'), :aliases => false)
    unless rules.is_a?(Hash) && rules['include'].is_a?(Array)
      raise ArgumentError, 'Invalid generated project publication rules'
    end
    approved = Hash.new { |hash, key| hash[key] = [] }
    rules['include'].each do |entry|
      next unless entry.is_a?(String) && entry.end_with?('[.]md')
      path = entry.sub(/\[\.\]md\z/, '.md')
      root = File.dirname(path)
      next unless roots.include?(root)
      unless File.basename(path).match?(ARTICLE) && path == "#{root}/#{File.basename(path)}"
        raise ArgumentError, 'Project publication rules must name exact root-level Markdown files'
      end
      approved[root] << path
    end
    [roots, approved.transform_values { |paths| paths.uniq.sort }]
  rescue StandardError => error
    raise Jekyll::Errors::FatalException,
          "Cannot read pruned project publication rules (#{error.class}). Run sync-projects.ps1 and check the manifest/config."
  end
end

Jekyll::Reader.prepend(ProjectPostReader) unless Jekyll::Reader.ancestors.include?(ProjectPostReader)
