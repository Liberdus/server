import { AbsPath } from './path_helper';
export declare class MockFSHelper {
    fs_structure: {
        [key: string]: any;
    };
    constructor(fs_structure?: {
        [key: string]: any;
    });
    addSourceDirContents(): MockFSHelper;
    addFile(file: AbsPath | string): MockFSHelper;
    addDirContents(dir: AbsPath, max_levels?: number): MockFSHelper;
    readonly src_dir: AbsPath;
    addDirs(dirs: Array<string | AbsPath>): MockFSHelper;
    static ls(dir: AbsPath | string, max_levels?: number, with_contents_of?: Array<string> | null): {
        [key: string]: any;
    };
}
