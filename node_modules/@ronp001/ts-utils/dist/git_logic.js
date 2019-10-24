"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_helper_1 = require("./path_helper");
const _ = require("lodash");
const chalk_1 = require("chalk");
class ErrorNotConnectedToProject extends Error {
}
exports.ErrorNotConnectedToProject = ErrorNotConnectedToProject;
class ErrorInvalidPath extends Error {
}
exports.ErrorInvalidPath = ErrorInvalidPath;
class ErrorAddFailed extends Error {
}
exports.ErrorAddFailed = ErrorAddFailed;
class ErrorCheckIgnoreFailed extends Error {
}
exports.ErrorCheckIgnoreFailed = ErrorCheckIgnoreFailed;
var GitState;
(function (GitState) {
    GitState["Undefined"] = "Undefined";
    GitState["NonRepo"] = "Non Repo";
    GitState["NoCommits"] = "No Commits";
    GitState["Dirty"] = "Dirty";
    GitState["Clean"] = "Clean";
    GitState["OpInProgress"] = "OpInProgress"; // a rebase or merge operation is in progress
})(GitState = exports.GitState || (exports.GitState = {}));
class GitLogic {
    constructor(path, log_function_or_args) {
        this.silent = false;
        this._path = new path_helper_1.AbsPath(null);
        this.runcmd = this._runcmd; // allow mocking
        this.keep_color = false;
        this._old_dir = null;
        this._paths_to_files_in_repo = undefined;
        this._analysis_includes_unadded = false;
        this.orig_file_count = 0;
        this.new_file_count = 0;
        this._ignored_files_cache = {};
        if (path != null) {
            this._path = path;
        }
        let args = {};
        if (typeof (log_function_or_args) == "function") {
            args.log_function = log_function_or_args;
        }
        else if (log_function_or_args != undefined) {
            args = log_function_or_args;
        }
        if (args.silent) {
            this.log = () => { };
            this.error = () => { };
            this.silent = true;
        }
        else {
            this.log = args.log_function ? args.log_function : console.log;
            this.error = args.error_function ? args.error_function : console.error;
        }
    }
    auto_connect() {
        let gitroot = new path_helper_1.AbsPath(process.cwd()).findUpwards(".git", true).parent;
        if (!gitroot.isDir) {
            throw "not in git repo";
        }
        this.project_dir = gitroot;
        return this;
    }
    get project_dir() { return this._path; }
    set project_dir(path) {
        this._path = path;
    }
    _chdir_to_repo() {
        if (this._old_dir != null) {
            throw new Error("_chdir_to_repo called twice without _restore_dir");
        }
        if (!this._path.isDir) {
            throw new ErrorInvalidPath("GitLogic: project_dir is not an existing directory");
        }
        let dirinfo = "";
        try {
            if (process.cwd() != this._path.abspath) {
                this._old_dir = process.cwd();
                process.chdir(this._path.abspath);
                dirinfo = chalk_1.default.blue(`(in ${process.cwd()}) `);
            }
            else {
                dirinfo = chalk_1.default.black(`(in ${process.cwd()}) `);
            }
        }
        catch (e) { // process.cwd() throws an error if the current directory does not exist
            process.chdir(this._path.abspath);
        }
        return dirinfo;
    }
    _restore_dir() {
        if (this._old_dir) {
            process.chdir(this._old_dir);
        }
        this._old_dir = null;
    }
    _runcmd(gitcmd, args = [], allowed_statuses = [], kwargs = {}) {
        try {
            const dirinfo = this._chdir_to_repo();
            this.log(dirinfo + chalk_1.default.blue("git " + [gitcmd].concat(args).join(" ")));
            let options = {};
            if (kwargs.stdio) {
                options.stdio = kwargs.stdio;
            }
            let result = child_process_1.execFileSync('git', [gitcmd].concat(args), options); // returns stdout of executed command
            if (result != null) {
                if (this.keep_color) {
                    this.log(result.toString());
                    this.keep_color = false;
                }
                else {
                    this.log(chalk_1.default.cyan(result.toString()));
                }
            }
            return result;
        }
        catch (e) {
            this.log("e.status:", e.status);
            if (allowed_statuses.indexOf(e.status) > -1) {
                this.log(chalk_1.default.black(`git command returned with allowed status ${e.status}`));
                return "";
            }
            this.error(chalk_1.default.cyan(`git command failed: ${e}`));
            throw e;
        }
        finally {
            this._restore_dir();
        }
    }
    /**
     * this method caches a list of all the files in the repo to support later calls to fast_is_file_in_repo()
     * @param include_unadded whether unignored files that were not added to the repo should be considered 'in repo'.
     * @param reset if false: do not run the analysis if has already been run on this repo
     */
    analyze_repo_contents(include_unadded, reset = true) {
        if (!reset && this._paths_to_files_in_repo != undefined) {
            return;
        }
        this._paths_to_files_in_repo = {};
        this._analysis_includes_unadded = include_unadded;
        const files = this.get_all_files_in_repo(include_unadded);
        for (const file of files) {
            const abspath = this._path.add(file);
            this._paths_to_files_in_repo[abspath.abspath] = true;
        }
        // console.log(this._paths_to_files_in_repo)
    }
    did_repo_filecount_change() {
        if (this._paths_to_files_in_repo == undefined) {
            throw Error("did_repo_filecount_change() called before call to analyze_repo_contents()");
        }
        const existing_count = Object.keys(this._paths_to_files_in_repo).length;
        const new_files = this.get_all_files_in_repo(this._analysis_includes_unadded);
        const new_count = new_files.length;
        // console.log('existing files:', Object.keys(this._paths_to_files_in_repo))
        // console.log('new files:', new_files)
        this.orig_file_count = existing_count;
        this.new_file_count = new_count;
        return new_count != existing_count;
    }
    /**
     * checks whether a specific file is in the git repo.
     * call 'analyze_repo_contents' once before starting a series of calls to this method.
     * @param abspath the absolute path to the file (as a string)
     */
    fast_is_file_in_repo(abspath) {
        if (this._paths_to_files_in_repo == undefined) {
            throw Error("fast_is_file_in_repo() called before call to analyze_repo_contents()");
        }
        // console.log("path:", abspath)
        // console.log(this._paths_to_files_in_repo)
        // console.log(this._paths_to_files_in_repo[abspath.toString()])
        return this._paths_to_files_in_repo[abspath] == true;
    }
    get_all_files_in_repo(include_unadded = false) {
        let opts = ['-c'];
        if (include_unadded) {
            opts = opts.concat(['-o', '--exclude-standard']);
        }
        const out = this._runcmd('ls-files', opts);
        // console.log(this.to_lines(out))
        return this.to_lines(out);
    }
    get_all_ignored_files() {
        try {
            this._chdir_to_repo();
            const cmd = `find ${this._path.abspath} -mindepth 1  | git check-ignore --stdin`;
            // console.log("cmd:", cmd, execSync(`find ${this._path.abspath}`).toString())
            const output = child_process_1.execSync(cmd);
            return this.to_lines(output);
        }
        finally {
            this._restore_dir();
        }
    }
    cache_ignored_files() {
        const ignored_files = this.get_all_ignored_files();
        this._ignored_files_cache = {};
        for (const file of ignored_files) {
            this._ignored_files_cache[file] = true;
        }
    }
    check_ignore(path) {
        let lines;
        let abspath = new path_helper_1.AbsPath(path).realpath.abspath;
        try {
            lines = this.to_lines(this.runcmd("check-ignore", [abspath], [1]));
        }
        catch (e) {
            throw new ErrorCheckIgnoreFailed(e.message + ` (path: ${abspath})`);
        }
        return lines.indexOf(abspath) > -1;
    }
    get state() {
        if (!this._path.isSet)
            return GitState.Undefined;
        if (!this.is_repo)
            return GitState.NonRepo;
        if (!this.has_head)
            return GitState.NoCommits;
        try {
            this.merge("HEAD");
        }
        catch (e) {
            return GitState.OpInProgress;
        }
        if (this.parsed_status.length > 0)
            return GitState.Dirty;
        return GitState.Clean;
    }
    get has_head() {
        return (this.current_branch_or_null != null);
    }
    get is_repo() {
        try {
            this.status();
        }
        catch (e) {
            return false;
        }
        return true;
    }
    status() {
        this.runcmd("status");
    }
    get parsed_status() {
        return this.to_lines(this.runcmd('status', ['--porcelain']));
    }
    get stash_list() {
        return this.to_lines(this.runcmd('stash', ['list']));
    }
    get stash_count() {
        return this.stash_list.length;
    }
    stash_with_untracked_excluding(dir_to_exclude) {
        let stashcount = this.stash_count;
        let output = this.runcmd("stash", ["push", "--include-untracked", "-m", "proj-maker-auto-stash", "--", `:(exclude)${dir_to_exclude}`]);
        // let output = this.runcmd("stash", ["push", "--include-untracked", "-m", "proj-maker-auto-stash", "--", ":(exclude)new_unit"])
        return (this.stash_count > stashcount);
    }
    // public stash_with_untracked() : boolean {
    //     let objname = this.runcmd("stash", ["create", "--include-untracked"])
    //     if ( objname == "") {
    //         return false
    //     }
    //     this.runcmd("stash", ["store", "-m", "proj-maker auto-stash", objname])
    //     return true
    // }
    stash_pop() {
        this.runcmd("stash", ["pop"]);
    }
    init() {
        this.runcmd("init");
    }
    get current_branch_or_null() {
        try {
            return this.runcmd("rev-parse", ["--abbrev-ref", "HEAD"]).toString().trim();
        }
        catch (e) {
            return null;
        }
    }
    get current_branch() {
        return this.current_branch_or_null || "";
    }
    show_branching_graph() {
        this.keep_color = true;
        this.runcmd("-c", ["color.ui=always", "log", "--graph", "--format='%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset%n'", "--abbrev-commit", "--date=relative", "--branches"]);
    }
    create_branch(branch_name, branching_point) {
        let result = this.runcmd("checkout", ["-b", branch_name, branching_point]).toString().trim();
        // this.runcmd("lgb")
        this.show_branching_graph();
        return result;
    }
    delete_branch(branch_name) {
        return this.runcmd("branch", ["-D", branch_name]).toString().trim();
    }
    checkout(branch_name) {
        this.runcmd("checkout", [branch_name]);
        this.show_branching_graph();
    }
    checkout_dir_from_branch(dir, branch_name) {
        this.runcmd("checkout", [branch_name, "--", dir]);
    }
    set_branch_description(branch, description) {
        this.runcmd('config', [`branch.${branch}.description`, description]);
    }
    get_branch_description(branch) {
        return this.to_lines(this.runcmd('config', [`branch.${branch}.description`]));
    }
    merge(branch_name) {
        this.runcmd("merge", [branch_name]);
        if (branch_name != "HEAD")
            this.show_branching_graph();
    }
    rebase_branch_from_point_onto(branch, from_point, onto) {
        let result = this.runcmd("rebase", ["--onto", onto, from_point, branch]);
        this.show_branching_graph();
        return result;
    }
    get commit_count() {
        try {
            return parseInt(this.runcmd("rev-list", ["--count", "HEAD"]).toString());
        }
        catch (e) {
            return 0;
        }
    }
    get_tags_matching(pattern) {
        return this.to_lines(this.runcmd("tag", ["-l", pattern]));
    }
    to_lines(buf) {
        let result;
        if (buf instanceof Buffer) {
            const str = buf.toString();
            result = str ? str.split("\n") : [];
        }
        else if (buf instanceof Array) {
            result = buf;
        }
        else {
            result = buf ? buf.split("\n") : [];
        }
        return _.filter(result, (s) => { return s.length > 0; });
    }
    get_files_in_commit(commit) {
        return this.to_lines(this.runcmd("diff-tree", ["--no-commit-id", "--name-only", "-r", commit]));
    }
    create_tag(tagname) {
        this.runcmd("tag", [tagname]);
    }
    move_tag_to_head(tagname) {
        this.runcmd("tag", ["-d", tagname]);
        this.runcmd("tag", [tagname]);
    }
    move_tag(tagname, ref) {
        this.runcmd("tag", ["-d", tagname]);
        this.runcmd("tag", [tagname, ref]);
    }
    mv(from, to) {
        this.runcmd("mv", [from, to]);
    }
    add(path) {
        let paths;
        if (path instanceof Array) {
            paths = path;
        }
        else {
            paths = [path];
        }
        try {
            this.runcmd("add", paths);
        }
        catch (e) {
            throw new ErrorAddFailed(e.message);
        }
    }
    ls_files_as_abspath() {
        let files = this.ls_files();
        let result = [];
        for (let file of files) {
            result.push(this.project_dir.add(file));
        }
        return result;
    }
    ls_files() {
        let files = this.to_lines(this.runcmd("ls-files"));
        return files;
    }
    commit(comment) {
        this.runcmd("commit", ["-m", comment]);
    }
    commit_allowing_empty(comment) {
        this.runcmd("commit", ["--allow-empty", "-m", comment]);
    }
    add_remote(name, url, args = {}) {
        let options = ["add", name, url];
        if (args.track_branch) {
            options = options.concat(["-t", args.track_branch]);
        }
        this.runcmd("remote", options);
    }
    remove_remote(name) {
        let options = ["remove", name];
        this.runcmd("remote", options);
    }
    rename_remote(from_name, to_name) {
        let options = ["rename", from_name, to_name];
        this.runcmd("remote", options);
    }
    get_remotes() {
        let result = [];
        let lines = this.to_lines(this.runcmd("remote", ["-v"]));
        for (let line of lines) {
            const s1 = line.split("\t");
            const name = s1[0];
            const s2 = s1[1].split(" ");
            const url = s2[0];
            if (s2[1] == "(fetch)") {
                result.push({ name: name, url: url });
            }
        }
        return result;
    }
    fetch(remote) {
        let options = [];
        if (remote) {
            options = options.concat([remote]);
        }
        this.runcmd("fetch", options);
    }
    clone_from(remote_url, args = {}) {
        if (remote_url instanceof path_helper_1.AbsPath) {
            remote_url = "file://" + remote_url.abspath;
        }
        if (!this.project_dir) {
            throw new ErrorInvalidPath("GitLogic: project_dir was not set");
        }
        const target_dir = this.project_dir;
        this.project_dir = target_dir.parent.validate("is_dir");
        let git_args = [remote_url, target_dir.abspath];
        if (args.as_remote) {
            git_args = git_args.concat(['-o', args.as_remote]);
        }
        if (args.head_branch) {
            git_args = git_args.concat(['-b', args.head_branch]);
        }
        this.runcmd("clone", git_args);
        this.project_dir = target_dir;
    }
    git_cmd(cmd, args, allowed_statuses = [], kwargs = {}) {
        return this.to_lines(this.runcmd(cmd, args, allowed_statuses, kwargs));
    }
}
exports.GitLogic = GitLogic;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0X2xvZ2ljLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2dpdF9sb2dpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGlEQUEyRTtBQUMzRSwrQ0FBdUM7QUFFdkMsNEJBQTJCO0FBQzNCLGlDQUF5QjtBQUd6QixNQUFhLDBCQUEyQixTQUFRLEtBQUs7Q0FBSTtBQUF6RCxnRUFBeUQ7QUFDekQsTUFBYSxnQkFBaUIsU0FBUSxLQUFLO0NBQUk7QUFBL0MsNENBQStDO0FBQy9DLE1BQWEsY0FBZSxTQUFRLEtBQUs7Q0FBSTtBQUE3Qyx3Q0FBNkM7QUFDN0MsTUFBYSxzQkFBdUIsU0FBUSxLQUFLO0NBQUk7QUFBckQsd0RBQXFEO0FBRXJELElBQVksUUFPWDtBQVBELFdBQVksUUFBUTtJQUNoQixtQ0FBdUIsQ0FBQTtJQUN2QixnQ0FBb0IsQ0FBQTtJQUNwQixvQ0FBd0IsQ0FBQTtJQUN4QiwyQkFBZSxDQUFBO0lBQ2YsMkJBQWUsQ0FBQTtJQUNmLHlDQUE2QixDQUFBLENBQUMsNkNBQTZDO0FBQy9FLENBQUMsRUFQVyxRQUFRLEdBQVIsZ0JBQVEsS0FBUixnQkFBUSxRQU9uQjtBQWNELE1BQWEsUUFBUTtJQUtqQixZQUFtQixJQUFjLEVBQzdCLG9CQUE0RTtRQUh4RSxXQUFNLEdBQUcsS0FBSyxDQUFBO1FBb0NkLFVBQUssR0FBWSxJQUFJLHFCQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7UUFPbkMsV0FBTSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQyxnQkFBZ0I7UUFDckMsZUFBVSxHQUFZLEtBQUssQ0FBQTtRQUUzQixhQUFRLEdBQWtCLElBQUksQ0FBQTtRQW9FOUIsNEJBQXVCLEdBQWdDLFNBQVMsQ0FBQTtRQUNoRSwrQkFBMEIsR0FBWSxLQUFLLENBQUE7UUF1QjVDLG9CQUFlLEdBQUcsQ0FBQyxDQUFBO1FBQ25CLG1CQUFjLEdBQUcsQ0FBQyxDQUFBO1FBd0RqQix5QkFBb0IsR0FBK0IsRUFBRSxDQUFB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