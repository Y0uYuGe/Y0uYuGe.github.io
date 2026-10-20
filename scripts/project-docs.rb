#!/usr/bin/env ruby
# frozen_string_literal: true

# Publish explicitly selected, root-level project articles without adding the
# surrounding independent repositories (or their .git directories) to this Git.
require 'date'
require 'digest'
require 'fileutils'
require 'json'
require 'open3'
require 'optparse'
require 'pathname'
require 'set'
require 'tempfile'
require 'tmpdir'
require 'yaml'

class ProjectDocsError < StandardError; end

class ProjectDocs
  MANIFEST = '_data/project-workspaces.json'
  OUTPUT = 'local/project-docs-config.yml'
  SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'
  PROJECT_PATH = %r{\A_posts/(?:#{SLUG}/)+#{SLUG}\z}
  ARTICLE_NAME = /\A(\d{4}-\d{2}-\d{2})-#{SLUG}\.md\z/
  EXCLUDE_BEGIN = '# BEGIN blog project-docs (managed)'
  EXCLUDE_END = '# END blog project-docs (managed)'

  def initialize(root)
    @root = Pathname.new(root).expand_path.realpath
    @projects = read_projects
    @root_documents = {}
    @articles = find_articles
    @expected_config = publication_config
  end

  def run(stage: false, check: false)
    verify_parent_repository
    inner_excludes = prepare_inner_excludes
    if check
      inner_excludes.each do |path, original, expected|
        fail_with("子项目的文档忽略规则已过期：#{path.relative_path_from(@root)}；请重新运行脚本。") unless original == expected
      end
      verify_saved_config
      verify_index(index_entries, compare_content: true)
      puts "检查通过：#{@projects.length} 个项目，#{@articles.length} 篇公开文章；父仓库仅跟踪选中的 Markdown。"
      return
    end

    stage_articles if stage
    inner_excludes.each do |path, original, expected|
      atomic_write(path, expected) unless original == expected
    end
    write_config
    action = stage ? '已暂存公开文档并生成配置' : '已生成本地发布配置'
    puts "#{action}：#{@projects.length} 个项目，#{@articles.length} 篇公开文章。"
    puts "配置：#{OUTPUT}"
    puts '未提交或推送；项目源码和未公开文档不会加入博客仓库。'
  end

  private

  def fail_with(message)
    raise ProjectDocsError, message
  end

  def relative_file(relative)
    candidate = @root.join(relative)
    # Reject every symlink component, including a linked project or local/ dir.
    current = @root
    Pathname.new(relative).each_filename do |part|
      current = current.join(part)
      fail_with("不支持符号链接路径：#{relative}") if current.symlink?
    end
    candidate
  end

  def read_utf8(path, description)
    text = path.binread.force_encoding(Encoding::UTF_8)
    fail_with("#{description}不是有效的 UTF-8 文件。") unless text.valid_encoding?
    text.delete_prefix("\uFEFF")
  rescue Errno::ENOENT
    fail_with("找不到#{description}：#{path.relative_path_from(@root)}")
  end

  def load_yaml(text, description)
    YAML.safe_load(text, permitted_classes: [Date, Time], permitted_symbols: [], aliases: true)
  rescue Psych::Exception, ArgumentError
    fail_with("#{description}的 YAML 格式无效，请检查文件开头的元信息。")
  end

  def read_projects
    data = JSON.parse(read_utf8(relative_file(MANIFEST), '项目清单'))
    unless data.is_a?(Hash) && data['version'] == 1 && data['projects'].is_a?(Array)
      fail_with('项目清单必须包含 version: 1 和 projects 数组。')
    end
    projects = data['projects'].map do |entry|
      unless entry.is_a?(Hash) && entry['repository'].is_a?(String) &&
             entry['repository'].match?(%r{\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z}) &&
             entry['path'].is_a?(String) && entry['path'].match?(PROJECT_PATH)
        fail_with('项目清单中的 repository 或 path 无效；路径须为 _posts/英文领域/英文项目，可含多层领域。')
      end
      relative_file(entry['path'])
      entry['path']
    end
    projects.combination(2) do |left, right|
      if left == right || left.start_with?("#{right}/") || right.start_with?("#{left}/")
        fail_with("项目目录重复或互相嵌套：#{left}、#{right}")
      end
    end
    projects.sort
  rescue JSON::ParserError
    fail_with('项目清单不是有效的 JSON 文件。')
  end

  def find_articles
    articles = {}
    @projects.each do |project|
      @root_documents[project] = []
      directory = relative_file(project)
      next unless directory.exist?
      fail_with("项目路径不是目录：#{project}") unless directory.directory?
      directory.children.sort_by(&:basename).each do |file|
        match = ARTICLE_NAME.match(file.basename.to_s)
        next unless match
        relative = "#{project}/#{file.basename}"
        relative_file(relative)
        next unless file.file?
        @root_documents[project] << file.basename.to_s
        begin
          Date.iso8601(match[1])
        rescue Date::Error
          fail_with("文章文件名中的日期无效：#{relative}")
        end
        bytes = file.binread
        text = bytes.dup.force_encoding(Encoding::UTF_8)
        fail_with("文章不是有效的 UTF-8 文件：#{relative}") unless text.valid_encoding?
        text = text.delete_prefix("\uFEFF")
        next unless text.match?(/\A---[ \t]*\r?\n/)
        front_matter = text.match(/\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\z)/m)
        fail_with("文章的 YAML 元信息缺少结束标记 ---：#{relative}") unless front_matter
        metadata = load_yaml(front_matter[1], relative)
        fail_with("文章的 YAML 元信息必须是键值结构：#{relative}") unless metadata.is_a?(Hash)
        published = metadata['published']
        unless published.nil? || published == false || published == true
          fail_with("published 必须使用 true 或 false，不能使用字符串：#{relative}")
        end
        next unless published == true
        unless metadata['title'].is_a?(String) && !metadata['title'].strip.empty?
          fail_with("公开文章必须填写非空 title：#{relative}")
        end
        articles[relative] = bytes
      end
    end
    articles.sort.to_h
  end

  def publication_config
    base = load_yaml(read_utf8(relative_file('_config.yml'), '站点配置'), '_config.yml')
    fail_with('_config.yml 必须是键值结构。') unless base.is_a?(Hash)
    %w[include exclude].each do |key|
      unless base[key].nil? || (base[key].is_a?(Array) && base[key].all? { |value| value.is_a?(String) })
        fail_with("_config.yml 中的 #{key} 必须是字符串数组。")
      end
    end
    includes = @articles.keys.map do |path|
      # Jekyll also accepts a prefix match. A literal-looking .md would admit
      # .md.bak; the glob [.]md keeps the selected file match exact.
      path.delete_prefix('_posts/').sub(/\.md\z/, '[.]md')
    end
    excludes = @projects.flat_map { |path| [path, path.delete_prefix('_posts/')] }
    original_include = Array(base['include']).dup
    original_exclude = Array(base['exclude']).dup
    includes.each { |entry| original_include << entry unless original_include.include?(entry) }
    excludes.each { |entry| original_exclude << entry unless original_exclude.include?(entry) }
    { 'include' => original_include, 'exclude' => original_exclude }
  end

  def git(*arguments, env: {}, input: nil)
    stdout, stderr, status = Open3.capture3(
      { 'GIT_TERMINAL_PROMPT' => '0' }.merge(env), 'git', *arguments,
      chdir: @root.to_s, stdin_data: input.to_s.b, binmode: true
    )
    fail_with("Git 操作失败（#{arguments.first}），请检查仓库或索引锁。") unless status.success?
    stdout
  rescue Errno::ENOENT
    fail_with('找不到 Git，请先安装 Git 并添加到 PATH。')
  end

  def verify_parent_repository
    top = git('rev-parse', '--show-toplevel').strip.force_encoding(Encoding::UTF_8)
    unless Pathname.new(top).realpath == @root
      fail_with('脚本根目录必须是博客仓库根目录，不能是其上级或嵌套项目。')
    end
  end

  def index_entries(env = {})
    git('ls-files', '--stage', '-z', env: env).split("\0").map do |record|
      match = /\A(\d{6}) ([0-9a-f]{40,64}) (\d)\t(.*)\z/m.match(record)
      fail_with('Git 索引格式无法识别。') unless match
      { mode: match[1], oid: match[2], stage: match[3],
        path: match[4].dup.force_encoding(Encoding::UTF_8), record: record }
    end
  end

  def project_path?(path)
    @projects.any? { |project| path == project || path.start_with?("#{project}/") }
  end

  def verify_index(entries, compare_content: false)
    selected = entries.select { |entry| project_path?(entry[:path]) }
    unless selected.all? { |entry| entry[:mode] == '100644' && entry[:stage] == '0' } &&
           selected.map { |entry| entry[:path] }.sort == @articles.keys.sort
      fail_with('父仓库中的项目文档索引与公开文章不一致，或含源码、gitlink、冲突/执行文件；请运行 --stage。')
    end
    return unless compare_content
    selected.each do |entry|
      oid = git('hash-object', "--path=#{entry[:path]}", '--stdin', input: @articles.fetch(entry[:path])).strip
      fail_with("文章尚未同步到父仓库索引：#{entry[:path]}；请运行 --stage。") unless oid == entry[:oid]
    end
  end

  def verify_saved_config
    path = relative_file(OUTPUT)
    fail_with("缺少 #{OUTPUT}；请先运行脚本生成发布配置。") unless path.file?
    actual = load_yaml(read_utf8(path, '本地发布配置'), OUTPUT)
    fail_with('本地发布配置已过期或包含额外配置；请重新生成。') unless actual == @expected_config
  end

  def prepare_inner_excludes
    @projects.filter_map do |project|
      git_directory = relative_file("#{project}/.git")
      next unless git_directory.exist?
      fail_with("项目须使用独立的普通 .git 目录：#{project}") unless git_directory.directory?
      top = git('-C', project, 'rev-parse', '--show-toplevel').strip.force_encoding(Encoding::UTF_8)
      unless Pathname.new(top).realpath == @root.join(project).realpath
        fail_with("无法确认子项目的独立 Git 边界：#{project}")
      end
      tracked = git('-C', project, 'ls-files', '-z').split("\0").map { |path| path.force_encoding(Encoding::UTF_8) }
      public_names = @articles.keys.filter_map { |path| path.delete_prefix("#{project}/") if path.start_with?("#{project}/") }
      conflict = public_names.find { |name| tracked.include?(name) }
      if conflict
        fail_with("公开文章已被子项目 Git 跟踪：#{project}/#{conflict}；请先明确转移其跟踪归属，忽略规则不能解除已有跟踪。")
      end
      path = relative_file("#{project}/.git/info/exclude")
      original = path.file? ? path.binread : ''.b
      block = ([EXCLUDE_BEGIN] + @root_documents.fetch(project).sort.map { |name| "/#{name}" } + [EXCLUDE_END, '']).join("\n").b
      begin_count = original.scan(EXCLUDE_BEGIN).length
      end_count = original.scan(EXCLUDE_END).length
      if begin_count > 1 || end_count > 1 || begin_count != end_count
        fail_with("子项目的文档忽略规则托管标记损坏：#{project}/.git/info/exclude")
      end
      if begin_count == 1
        managed = /^#{Regexp.escape(EXCLUDE_BEGIN)}\r?\n.*?^#{Regexp.escape(EXCLUDE_END)}(?:\r?\n|\z)/m
        fail_with("子项目的文档忽略规则托管标记顺序有误：#{project}/.git/info/exclude") unless original.match?(managed)
        expected = original.sub(managed, block)
      else
        separator = original.empty? || original.end_with?("\n") ? ''.b : "\n".b
        expected = original + separator + block
      end
      [path, original, expected]
    end
  end

  def atomic_write(path, bytes)
    FileUtils.mkdir_p(path.dirname)
    Tempfile.create(['project-docs-', '.tmp'], path.dirname.to_s, binmode: true) do |temporary|
      temporary.write(bytes)
      temporary.flush
      temporary.fsync
      temporary.close
      File.rename(temporary.path, path.to_s)
    end
  end

  def write_config
    output = relative_file(OUTPUT)
    bytes = "# 自动生成；请修改项目根目录文章的 published 字段后重新运行。\n" + YAML.dump(@expected_config)
    atomic_write(output, bytes.encode(Encoding::UTF_8))
  end

  def stage_articles
    entries = index_entries
    if entries.any? { |entry| project_path?(entry[:path]) && entry[:stage] != '0' }
      fail_with('项目目录存在尚未解决的 Git 合并冲突，请先处理冲突。')
    end
    index_path = Pathname.new(git('rev-parse', '--git-path', 'index').strip.force_encoding(Encoding::UTF_8))
    index_path = @root.join(index_path).cleanpath unless index_path.absolute?
    fail_with('不支持符号链接形式的 Git 索引。') if index_path.symlink?
    original_bytes = index_path.file? ? index_path.binread : nil
    original_outside = entries.reject { |entry| project_path?(entry[:path]) }.map { |entry| entry[:record] }.sort

    Dir.mktmpdir('project-docs-index-', index_path.dirname.to_s) do |temporary_directory|
      temporary_index = File.join(temporary_directory, 'index')
      env = { 'GIT_INDEX_FILE' => temporary_index }
      if original_bytes
        File.binwrite(temporary_index, original_bytes)
      else
        git('read-tree', '--empty', env: env)
      end
      entries.select { |entry| project_path?(entry[:path]) && !@articles.key?(entry[:path]) }.each do |entry|
        git('update-index', '--force-remove', '--', entry[:path], env: env)
      end
      @articles.each do |path, bytes|
        oid = git('hash-object', '-w', "--path=#{path}", '--stdin', input: bytes).strip
        fail_with('Git 返回了无效的文档对象编号。') unless oid.match?(/\A[0-9a-f]{40,64}\z/)
        git('update-index', '--add', '--cacheinfo', '100644', oid, path, env: env)
      end
      prepared = index_entries(env)
      verify_index(prepared, compare_content: true)
      prepared_outside = prepared.reject { |entry| project_path?(entry[:path]) }.map { |entry| entry[:record] }.sort
      fail_with('索引准备会改变项目以外的暂存内容，操作已取消。') unless prepared_outside == original_outside
      replace_index(index_path, temporary_index, original_bytes)
    end
    verify_index(index_entries, compare_content: true)
  end

  def replace_index(index_path, temporary_index, original_bytes)
    lock_path = "#{index_path}.lock"
    owned_lock = false
    begin
      File.open(lock_path, File::WRONLY | File::CREAT | File::EXCL, 0o600) do |lock|
        owned_lock = true
        current_bytes = index_path.file? ? index_path.binread : nil
        unless current_bytes == original_bytes
          fail_with('博客暂存区在处理过程中发生变化，操作已取消；请重试。')
        end
        lock.binmode
        lock.write(File.binread(temporary_index))
        lock.flush
        lock.fsync
      end
      File.rename(lock_path, index_path.to_s)
      owned_lock = false
    rescue Errno::EEXIST
      fail_with('Git 索引正在被其他程序使用，请等待其完成后重试。')
    ensure
      File.delete(lock_path) if owned_lock && File.exist?(lock_path)
    end
  end
end

if $PROGRAM_NAME == __FILE__
  # RubyInstaller can misdecode __dir__ for a Chinese script path on Windows.
  # CWD and an explicit root arrive through the native wide-character APIs.
  default_root = ENV['BLOG_PROJECT_ROOT']
  default_root = Dir.pwd if default_root.to_s.empty? && File.file?(File.join(Dir.pwd, ProjectDocs::MANIFEST))
  default_root = File.expand_path('..', __dir__) if default_root.to_s.empty?
  options = { root: default_root, stage: false, check: false }
  parser = OptionParser.new do |opts|
    opts.banner = '用法：ruby scripts/project-docs.rb [--stage | --check] [--root 博客根目录]'
    opts.on('--stage', '生成配置，并仅同步公开文章到父博客 Git 暂存区') { options[:stage] = true }
    opts.on('--check', '只读检查配置、公开文章和父博客 Git 索引') { options[:check] = true }
    opts.on('--root ROOT', '指定博客根目录（默认是本脚本所在仓库）') { |value| options[:root] = value }
    opts.on('-h', '--help', '显示帮助') { puts opts; exit }
  end
  begin
    parser.parse!
    raise ProjectDocsError, '--stage 与 --check 不能同时使用。' if options[:stage] && options[:check]
    raise ProjectDocsError, '存在无法识别的参数。' unless ARGV.empty?
    ProjectDocs.new(options[:root]).run(stage: options[:stage], check: options[:check])
  rescue ProjectDocsError, OptionParser::ParseError => error
    warn "错误：#{error.message}"
    exit 1
  rescue SystemCallError => error
    warn "错误：无法访问项目或配置文件（#{error.class.name}），请检查路径和权限。"
    exit 1
  end
end
