"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const path_helper_1 = require("./path_helper");
const util_1 = require("util");
class MockFSHelper {
    constructor(fs_structure = {}) {
        this.fs_structure = fs_structure;
    }
    addSourceDirContents() {
        this.addDirContents(this.src_dir);
        return this;
    }
    addFile(file) {
        if (util_1.isString(file)) {
            file = new path_helper_1.AbsPath(file);
        }
        if (file._abspath == null) {
            throw "file path is null";
        }
        this.fs_structure[file._abspath] = file.contentsBuffer.toString();
        return this;
    }
    addDirContents(dir, max_levels = 5) {
        for (let entry of dir.dirContents || []) {
            if (entry.isFile) {
                if (entry._abspath == null) {
                    throw "entry path is null";
                }
                this.fs_structure[entry._abspath] = entry.contentsBuffer.toString();
            }
            else if (entry.isDir && max_levels > 0) {
                this.addDirContents(entry, max_levels - 1);
            }
        }
        return this;
    }
    get src_dir() {
        return new path_helper_1.AbsPath(__dirname).findUpwards("src", true);
    }
    addDirs(dirs) {
        for (let dir of dirs) {
            this.addDirContents(new path_helper_1.AbsPath(dir));
        }
        return this;
    }
    static ls(dir, max_levels = 5, with_contents_of = null) {
        let result = {};
        if (typeof (dir) == "string")
            dir = new path_helper_1.AbsPath(dir);
        for (let entry of dir.dirContents || []) {
            // console.log(entry.abspath)
            if (entry.isFile) {
                if (with_contents_of && (with_contents_of[0] == '*' || _.includes(with_contents_of, entry._abspath))) {
                    result[entry.basename] = entry.contentsBuffer.toString();
                }
                else {
                    result[entry.basename] = "<file>";
                }
            }
            else if (entry.isDir) {
                if (max_levels > 0) {
                    result[entry.basename] = this.ls(entry, max_levels - 1, with_contents_of);
                }
                else {
                    result[entry.basename] = "<dir>";
                }
            }
        }
        return result;
    }
}
exports.MockFSHelper = MockFSHelper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja19mc19oZWxwZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvbW9ja19mc19oZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFHQSw0QkFBMkI7QUFDM0IsK0NBQXdDO0FBQ3hDLCtCQUFnQztBQUVoQyxNQUFhLFlBQVk7SUFFckIsWUFBMEIsZUFBb0MsRUFBRTtRQUF0QyxpQkFBWSxHQUFaLFlBQVksQ0FBMEI7SUFBRyxDQUFDO0lBRTdELG9CQUFvQjtRQUN2QixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQTtRQUNqQyxPQUFPLElBQUksQ0FBQTtJQUNmLENBQUM7SUFFTSxPQUFPLENBQUMsSUFBb0I7UUFDL0IsSUFBSyxlQUFRLENBQUMsSUFBSSxDQUFDLEVBQUc7WUFDbEIsSUFBSSxHQUFHLElBQUkscUJBQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtTQUMzQjtRQUNELElBQUssSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLEVBQUc7WUFDekIsTUFBTSxtQkFBbUIsQ0FBQTtTQUM1QjtRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLENBQUE7UUFDakUsT0FBTyxJQUFJLENBQUE7SUFDZixDQUFDO0lBRU0sY0FBYyxDQUFDLEdBQVksRUFBRSxhQUFzQixDQUFDO1FBQ3ZELEtBQU0sSUFBSSxLQUFLLElBQUksR0FBRyxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUU7WUFDdEMsSUFBSyxLQUFLLENBQUMsTUFBTSxFQUFHO2dCQUNoQixJQUFLLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxFQUFHO29CQUMxQixNQUFNLG9CQUFvQixDQUFBO2lCQUM3QjtnQkFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxDQUFBO2FBQ3RFO2lCQUFNLElBQUssS0FBSyxDQUFDLEtBQUssSUFBSSxVQUFVLEdBQUcsQ0FBQyxFQUFFO2dCQUN2QyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxVQUFVLEdBQUMsQ0FBQyxDQUFDLENBQUE7YUFDM0M7U0FDSjtRQUNELE9BQU8sSUFBSSxDQUFBO0lBQ2YsQ0FBQztJQUVELElBQVcsT0FBTztRQUNkLE9BQU8sSUFBSSxxQkFBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUE7SUFDMUQsQ0FBQztJQUVNLE9BQU8sQ0FBQyxJQUEyQjtRQUN0QyxLQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRztZQUNwQixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUkscUJBQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO1NBQ3hDO1FBQ0QsT0FBTyxJQUFJLENBQUE7SUFDZixDQUFDO0lBRU0sTUFBTSxDQUFDLEVBQUUsQ0FBQyxHQUFtQixFQUFFLGFBQXNCLENBQUMsRUFBRSxtQkFBMEMsSUFBSTtRQUN6RyxJQUFJLE1BQU0sR0FBd0IsRUFBRSxDQUFBO1FBQ3BDLElBQUssT0FBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLFFBQVE7WUFBRSxHQUFHLEdBQUcsSUFBSSxxQkFBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBRXBELEtBQU0sSUFBSSxLQUFLLElBQUksR0FBRyxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUU7WUFDdEMsNkJBQTZCO1lBQzdCLElBQUssS0FBSyxDQUFDLE1BQU0sRUFBRztnQkFDaEIsSUFBSyxnQkFBZ0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFO29CQUNuRyxNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLENBQUE7aUJBQzNEO3FCQUFNO29CQUNILE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsUUFBUSxDQUFBO2lCQUNwQzthQUNKO2lCQUFNLElBQUssS0FBSyxDQUFDLEtBQUssRUFBRztnQkFDdEIsSUFBSyxVQUFVLEdBQUcsQ0FBQyxFQUFFO29CQUNqQixNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQTtpQkFDNUU7cUJBQU07b0JBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxPQUFPLENBQUE7aUJBQ25DO2FBQ0o7U0FDSjtRQUNELE9BQU8sTUFBTSxDQUFBO0lBQ2pCLENBQUM7Q0FDSjtBQW5FRCxvQ0FtRUMifQ==