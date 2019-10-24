/// <reference types="node" />
import { AbsPath } from "./path_helper";
export declare class ErrorNotConnectedToProject extends Error {
}
export declare class ErrorInvalidPath extends Error {
}
export declare class ErrorAddFailed extends Error {
}
export declare class ErrorCheckIgnoreFailed extends Error {
}
export declare enum GitState {
    Undefined = "Undefined",
    NonRepo = "Non Repo",
    NoCommits = "No Commits",
    Dirty = "Dirty",
    Clean = "Clean",
    OpInProgress = "OpInProgress"
}
export interface RemoteInfo {
    name: string;
    url: string;
}
export declare type GitLogicConstructionArgs = {
    log_function?: (...args: any[]) => void;
    error_function?: (...args: any[]) => void;
    silent?: boolean;
};
export declare class GitLogic {
    private log;
    private error;
    private silent;
    constructor(path?: AbsPath, log_function_or_args?: ((...args: any[]) => void) | GitLogicConstructionArgs);
    auto_connect(): this;
    private _path;
    project_dir: AbsPath;
    runcmd: (gitcmd: string, args?: string[], allowed_statuses?: number[], kwargs?: {
        stdio?: any;
    }) => string | string[] | Buffer;
    private keep_color;
    private _old_dir;
    private _chdir_to_repo;
    private _restore_dir;
    private _runcmd;
    private _paths_to_files_in_repo?;
    private _analysis_includes_unadded;
    /**
     * this method caches a list of all the files in the repo to support later calls to fast_is_file_in_repo()
     * @param include_unadded whether unignored files that were not added to the repo should be considered 'in repo'.
     * @param reset if false: do not run the analysis if has already been run on this repo
     */
    analyze_repo_contents(include_unadded: boolean, reset?: boolean): void;
    orig_file_count: number;
    new_file_count: number;
    did_repo_filecount_change(): boolean;
    /**
     * checks whether a specific file is in the git repo.
     * call 'analyze_repo_contents' once before starting a series of calls to this method.
     * @param abspath the absolute path to the file (as a string)
     */
    fast_is_file_in_repo(abspath: string): boolean;
    get_all_files_in_repo(include_unadded?: boolean): string[];
    get_all_ignored_files(): string[];
    private _ignored_files_cache;
    cache_ignored_files(): void;
    check_ignore(path: string | AbsPath): boolean;
    readonly state: GitState;
    readonly has_head: boolean;
    readonly is_repo: boolean;
    status(): void;
    readonly parsed_status: string[];
    readonly stash_list: string[];
    readonly stash_count: number;
    stash_with_untracked_excluding(dir_to_exclude: string): boolean;
    stash_pop(): void;
    init(): void;
    readonly current_branch_or_null: string | null;
    readonly current_branch: string;
    show_branching_graph(): void;
    create_branch(branch_name: string, branching_point: string): string;
    delete_branch(branch_name: string): string;
    checkout(branch_name: string): void;
    checkout_dir_from_branch(dir: string, branch_name: string): void;
    set_branch_description(branch: string, description: string): void;
    get_branch_description(branch: string): string[];
    merge(branch_name: string): void;
    rebase_branch_from_point_onto(branch: string, from_point: string, onto: string): string | string[] | Buffer;
    readonly commit_count: number;
    get_tags_matching(pattern: string): string[];
    to_lines(buf: Buffer | string[] | string): string[];
    get_files_in_commit(commit: string): string[];
    create_tag(tagname: string): void;
    move_tag_to_head(tagname: string): void;
    move_tag(tagname: string, ref: string): void;
    mv(from: string, to: string): void;
    add(path: string | string[]): void;
    ls_files_as_abspath(): AbsPath[];
    ls_files(): string[];
    commit(comment: string): void;
    commit_allowing_empty(comment: string): void;
    add_remote(name: string, url: string, args?: {
        track_branch?: string;
    }): void;
    remove_remote(name: string): void;
    rename_remote(from_name: string, to_name: string): void;
    get_remotes(): Array<RemoteInfo>;
    fetch(remote?: string): void;
    clone_from(remote_url: string | AbsPath, args?: {
        as_remote?: string;
        head_branch?: string;
    }): void;
    git_cmd(cmd: string, args: string[], allowed_statuses?: number[], kwargs?: {
        stdio?: any;
    }): string[];
}
