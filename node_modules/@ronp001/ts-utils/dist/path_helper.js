"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const _ = require("lodash");
var isBinaryFile = require("isbinaryfile");
function notnull(arg, name) {
    if (arg == null) {
        const exp = name ? ` for ${name}` : "";
        throw new Error(`unexpected value${exp}: ${arg}`);
    }
    return arg;
}
exports.notnull = notnull;
/**
 * An immutable path object with utility methods to navigate the filesystem, get information and perform
 * operations on the path (read,write,etc.)
 */
class AbsPath {
    //------------------------------------------------------------
    // Factory Methods
    //------------------------------------------------------------
    /**
     * create an absolute path from a string
     *
     * @param pathseg - if an absolute path, ignores basedir
     *                  if relative path, uses basedir as reference point
     * @param basedir - if null: uses process.cwd() as basedir
     */
    static fromStringAllowingRelative(pathseg = null, basedir = null) {
        if (basedir == null) {
            basedir = process.cwd();
        }
        if (pathseg) {
            if (path.isAbsolute(pathseg)) {
                return new AbsPath(pathseg);
            }
            else {
                return new AbsPath(path.join(basedir, pathseg));
            }
        }
        else {
            return new AbsPath(basedir);
        }
    }
    /**
     * @param filepath starting point
     *
     * @returns array with an AbsPath object for each containing directory
     */
    static dirHierarchy(filepath) {
        return new AbsPath(filepath).dirHierarchy;
    }
    get abspath() {
        if (this._abspath == null) {
            throw new Error("abspath is not set");
        }
        return this._abspath;
    }
    /**
     *
     * @param from a string or AbsPath specifying an absolute path, or null
     */
    constructor(from) {
        if (from == null || typeof from == "undefined") {
            this._abspath = null;
        }
        else if (from instanceof AbsPath) {
            this._abspath = from._abspath;
        }
        else {
            if (path.isAbsolute(from)) {
                this._abspath = path.normalize(from);
            }
            else {
                this._abspath = path.normalize(path.join(process.cwd(), from));
            }
        }
    }
    /**
     * @returns normalized absolute path.  returns "" if no path set
     */
    toString() {
        if (this._abspath == null)
            return "";
        return this._abspath;
    }
    /**
     * @return the basename of the path
     */
    get basename() {
        if (this._abspath == null)
            return "";
        return path.basename(this._abspath);
    }
    /**
     * @param other
     * @param must_be_contained_in_other
     *
     * @returns the relative path to get to this path from other
     */
    relativeFrom(other, must_be_contained_in_other = false) {
        if (this._abspath == null)
            return null;
        if (other._abspath == null)
            return null;
        if (must_be_contained_in_other) {
            if (!this._abspath.startsWith(other._abspath))
                return null;
        }
        let result = path.relative(other._abspath, this._abspath);
        if (result == "") {
            if (this.isDir) {
                result = ".";
            }
        }
        return result;
    }
    /**
     *
     * @param other
     * @param must_be_contained_in_other
     *
     * @returns the relative path to get to the other path from this path
     */
    // public relativeTo(other: AbsPath, must_be_contained_in_other: boolean = false): string | null {
    //     return other.relativeFrom(this)
    // }
    /**
     * @returns true if path is set, false if it is null
     */
    get isSet() {
        return (this._abspath != null);
    }
    /**
     *
     * @param filepath path segment to add
     *
     * @returns filepath with the additional segment
     */
    add(filepath) {
        if (this._abspath == null)
            return this;
        return new AbsPath(path.join(this._abspath, filepath.toString()));
    }
    /**
     * @returns AbsPath of the parent dir. If path is root, returns AbsPath of root.
     */
    get parent() {
        if (this._abspath == null)
            return this;
        let parent_dir = path.dirname(this._abspath);
        return new AbsPath(parent_dir);
    }
    /**
     * @param n how many levels up the hierarchy
     * @returns AbsPath of the directory which is <n> levels up.  (.parents(1) is the same is .parent)
     */
    parents(n) {
        let p = this;
        while (n > 0) {
            p = p.parent;
            n--;
        }
        return p;
    }
    //------------------------------------------------------------
    // Recognition
    //------------------------------------------------------------
    /**
     * @returns true if root directory of the filesystem, false otherwise
     */
    get isRoot() {
        if (this._abspath == null)
            return false;
        return (this._abspath == path.parse(this._abspath).root);
    }
    /**
     * @returns true if path is found in the filesystem, false otherwise
     */
    get exists() {
        if (this._abspath == null)
            return false;
        try {
            fs.lstatSync(this._abspath);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * @returns true if a normal file, false otherwise
     */
    get isFile() {
        if (this._abspath == null)
            return false;
        try {
            return fs.lstatSync(this._abspath).isFile();
        }
        catch (e) {
            return false;
        }
    }
    /**
     * @returns true if a directory, false otherwise
     */
    get isDir() {
        if (this._abspath == null)
            return false;
        try {
            return fs.lstatSync(this._abspath).isDirectory();
        }
        catch (e) {
            return false;
        }
    }
    /**
     * @returns true if a directory, false otherwise
     */
    get isEmptyDir() {
        if (this._abspath == null)
            return false;
        if (!this.isDir)
            return false;
        try {
            const files = fs.readdirSync(this._abspath);
            return files.length == 0;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * @returns true if a symbolic link, false otherwise
     */
    get isSymLink() {
        if (this._abspath == null)
            return false;
        try {
            return fs.lstatSync(this._abspath).isSymbolicLink();
        }
        catch (e) {
            return false;
        }
    }
    /**
     * see https://www.npmjs.com/package/isbinaryfile
     *
     * @returns true if the file is binary, false otherwise
     */
    get isBinaryFile() {
        if (this._abspath == null)
            return false;
        if (!this.isFile)
            return false;
        return isBinaryFile.sync(this._abspath);
    }
    /**
     * throws an exception if path validation fails.
     * @param t what to check for
     * @returns itself
     */
    validate(t) {
        if (!this.exists) {
            if (t == "is_dir") {
                throw new Error(`${this._abspath}/ does not exist`);
            }
            else {
                throw new Error(`${this._abspath} does not exist`);
            }
        }
        switch (t) {
            case "exists":
                break;
            case "is_dir":
                if (!this.isDir)
                    throw new Error(`${this._abspath}/ is not a directory`);
                break;
            case "is_file":
                if (!this.isFile)
                    throw new Error(`${this._abspath} is not a file`);
                break;
            case "is_symlink":
                if (!this.isSymLink)
                    throw new Error(`${this._abspath} is not a symlink`);
                break;
            case "is_binary":
                if (!this.isBinaryFile)
                    throw new Error(`${this._abspath} is not a binary file`);
                break;
            default:
                throw new Error(`unhandled validation: ${t}`);
        }
        return this;
    }
    //------------------------------------------------------------
    // Directory Contents
    //------------------------------------------------------------
    /**
     * @returns true if contains a file of the given name, false otherwise
     */
    containsFile(filename) {
        if (this._abspath == null)
            return false;
        return this.add(filename).isFile;
    }
    /**
     * @returns true if contains a directory of the given name, false otherwise
     */
    containsDir(filename) {
        if (this._abspath == null)
            return false;
        return this.add(filename).isDir;
    }
    /**
     * scans upwards from the current path, looking for a file or directory with a given name
     * @param filename the fs entry to search for
     * @param can_be_dir if false, will only look for regular files.  if true, will look for directories as well.
     * @returns true if found, false if not
     */
    findUpwards(filename, can_be_dir = false) {
        for (let dir of this.dirHierarchy) {
            if (dir.containsFile(filename)) {
                return dir.add(filename);
            }
            else if (can_be_dir && dir.containsDir(filename)) {
                return dir.add(filename);
            }
        }
        return new AbsPath(null);
    }
    /**
     * @returns an array of AbsPath objects, each one pointing to a containing directory
     */
    get dirHierarchy() {
        let current = this;
        let result = [];
        let allowed_depth = 30;
        do {
            result.push(current);
            current = current.parent;
        } while (allowed_depth-- > 0 && !current.isRoot && current._abspath != current.parent._abspath);
        result.push(current.parent);
        return result;
    }
    //------------------------------------------------------------
    // Symbolic Link Processing
    //------------------------------------------------------------
    /**
     * @returns an AbsPath pointing to the target of the symbolic link
     */
    get symLinkTarget() {
        if (this._abspath == null)
            return this;
        if (!this.isSymLink)
            return this;
        return new AbsPath(fs.readlinkSync(this._abspath).toString());
    }
    /**
     * @returns an AbsPath with symbolic links completely resolved
     */
    get realpath() {
        if (this._abspath == null)
            return this;
        return new AbsPath(fs.realpathSync(this._abspath));
    }
    //------------------------------------------------------------
    // File Contents
    //------------------------------------------------------------
    /**
     * @returns file contents as an array of strings
     */
    get contentsLines() {
        return this.contentsString.split('\n');
    }
    /**
     * @returns file contents as an array of strings
     */
    get contentsString() {
        if (this._abspath == null || !this.isFile)
            return "";
        return fs.readFileSync(this._abspath, 'utf8');
    }
    /**
     * @returns file contents as a buffer object
     */
    get contentsBuffer() {
        if (this._abspath == null || !this.isFile)
            return Buffer.alloc(0);
        return fs.readFileSync(this._abspath);
    }
    /**
     * @returns parsed contents of a JSON file or null if not a JSON file
     */
    get contentsFromJSON() {
        if (this._abspath == null || !this.isFile)
            return null;
        let buf = this.contentsBuffer;
        try {
            return JSON.parse(buf.toString());
        }
        catch (e) {
            return null;
        }
    }
    /**
     * store new contents in the file
     *
     * @param contents a string with the new contents
     */
    saveStrSync(contents) {
        if (this._abspath == null) {
            throw new Error("can't save - abspath is null");
        }
        try {
            this.parent.mkdirs();
        }
        catch (e) {
            throw new Error(`can't save ${this.toString()} - ${e.message}`);
        }
        fs.writeFileSync(this._abspath, contents);
    }
    //------------------------------------------------------------
    // Directory contents and traversal
    //------------------------------------------------------------
    /**
     * @returns an array of AbsPath objects corresponding to each entry in the directory
     * or null if not a directory
     */
    get dirContents() {
        if (this._abspath == null)
            return null;
        if (!this.isDir)
            return null;
        let result = [];
        for (let entry of fs.readdirSync(this._abspath)) {
            result.push(this.add(entry));
        }
        return result;
    }
    /**
     * Traverse the directory hierarchy and activate a callback for each entry.
     *
     * The hierarchy is traversed twice: first down, then up, allowing the callback
     * function to accumulate data on the way down and perform operations on the way up.
     *
     * Aborts the traversal if the callback function returns true
     *
     * @param fn callback to activate
     */
    foreachEntryInDir(fn) {
        let entries = this.dirContents;
        if (entries == null)
            return true;
        for (let entry of entries) {
            if (entry.isDir) {
                let abort;
                abort = fn(entry, "down");
                if (abort)
                    return true;
                abort = entry.foreachEntryInDir(fn);
                if (abort)
                    return true;
                abort = fn(entry, "up");
                if (abort)
                    return true;
            }
            else {
                let abort = fn(entry, null);
                if (abort)
                    return true;
            }
        }
        return false;
    }
    //------------------------------------------------------------
    // Modifying the filesystem
    //------------------------------------------------------------
    renameTo(new_name) {
        if (this._abspath == null)
            return;
        if (!this.exists)
            return;
        fs.renameSync(this._abspath, new_name);
    }
    unlinkFile() {
        this.rmFile();
    }
    rmFile() {
        if (this._abspath == null) {
            throw new Error(`rmFile - path is not set`);
        }
        if (!this.isFile) {
            throw new Error(`rmFile - ${this} is not a file`);
        }
        fs.unlinkSync(this._abspath);
    }
    //------------------------------------------------------------
    // Directory creation and removal
    //------------------------------------------------------------
    mkdirs() {
        if (this._abspath == null)
            throw new Error("can't mkdirs for null abspath");
        if (this.exists)
            return;
        if (this.isRoot)
            return;
        let parent = this.parent;
        if (parent.exists && !parent.isDir && !parent.isSymLink) {
            throw new Error(`${parent.toString()} exists and is not a directory or symlink`);
        }
        else {
            parent.mkdirs();
        }
        fs.mkdirSync(this.parent.realpath.add(this.basename).toString());
    }
    rmrfdir(must_match, remove_self = false) {
        if (this._abspath == null)
            return;
        if (!this.isDir)
            return;
        if (remove_self && !this._abspath.match(must_match)) {
            throw new Error(`${this._abspath} does not match ${must_match} - aborting delete operation`);
        }
        this.foreachEntryInDir((p, direction) => {
            if (p._abspath == null)
                return;
            if (!p._abspath.match(must_match)) {
                throw new Error(`${p._abspath} does not match ${must_match} - aborting delete operation`);
            }
            if (direction == "up" || direction == null) {
                if (p.isDir) {
                    fs.rmdirSync(p._abspath);
                }
                else {
                    fs.unlinkSync(p._abspath);
                }
            }
        });
        if (remove_self) {
            fs.rmdirSync(this._abspath);
        }
    }
    //------------------------------------------------------------
    // File version naming
    //
    // (assumes a numeric suffix describing the version
    //  e.g:  "myfile.txt.3" is version 3 of "myfile.txt")
    //
    // Useful for keeping a backup of a file before modifying it.
    //------------------------------------------------------------
    get maxVer() {
        let existing_versions = this.existingVersions;
        if (existing_versions == null)
            return null;
        let max = _.max(existing_versions);
        if (max == undefined)
            return null;
        return max;
    }
    renameToNextVer() {
        let current_max_ver = this.maxVer;
        let newname;
        if (current_max_ver == null) {
            newname = this._abspath + ".1";
        }
        else {
            newname = this._abspath + `.${current_max_ver + 1}`;
        }
        this.renameTo(newname);
        return newname;
    }
    get existingVersions() {
        if (this._abspath == null)
            return null;
        if (!this.exists)
            return null;
        let regex = new RegExp(`${this._abspath}\.([0-9]+)`);
        let existing = this.parent.dirContents;
        let matching = _.map(existing, (el) => {
            let matches = el.toString().match(regex);
            if (matches == null)
                return null;
            return parseInt(matches[1]);
        });
        let nums = _.filter(matching, (e) => { return e != null; });
        return _.sortBy(nums);
    }
}
exports.AbsPath = AbsPath;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aF9oZWxwZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcGF0aF9oZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSw2QkFBNEI7QUFDNUIseUJBQXdCO0FBQ3hCLDRCQUEyQjtBQUMzQixJQUFJLFlBQVksR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUE7QUFHMUMsU0FBZ0IsT0FBTyxDQUFJLEdBQXlCLEVBQUUsSUFBYTtJQUMvRCxJQUFJLEdBQUcsSUFBSSxJQUFJLEVBQUU7UUFDYixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQTtRQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsQ0FBQTtLQUNwRDtJQUNELE9BQU8sR0FBRyxDQUFBO0FBQ2QsQ0FBQztBQU5ELDBCQU1DO0FBRUQ7OztHQUdHO0FBQ0gsTUFBYSxPQUFPO0lBRWhCLDhEQUE4RDtJQUM5RCxrQkFBa0I7SUFDbEIsOERBQThEO0lBRTlEOzs7Ozs7T0FNRztJQUNJLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxVQUF5QixJQUFJLEVBQUUsVUFBeUIsSUFBSTtRQUNqRyxJQUFJLE9BQU8sSUFBSSxJQUFJLEVBQUU7WUFDakIsT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQTtTQUMxQjtRQUNELElBQUksT0FBTyxFQUFFO1lBQ1QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUMxQixPQUFPLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFBO2FBQzlCO2lCQUFNO2dCQUNILE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQTthQUNsRDtTQUNKO2FBQU07WUFDSCxPQUFPLElBQUksT0FB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