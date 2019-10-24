[![Build Status](https://travis-ci.org/ronp001/ts-utils.svg?branch=master)](https://travis-ci.org/ronp001/ts-utils)

# ts-utils

This is where I keep various reusable utility classes for my typescript projects.  Some are more robust than others.

## What you can find here at the moment
* In `path_helper.ts`:  a class called `AbsPath`, which is somewhat inspired by ruby's `Pathname`.  For examples of how to use it, check out 
the unit test (`src/__tests__/path_helper.test.ts`).  Note that (at least at the moment) all operations are synchronous.

* In `git_logic.ts`: a class called `GitLogic` which has methods for executing various git operations.  no unit test for this one at this point.

* In `mock_fs_helper.ts`: `MockFSHelper` - a utility that simplifies copying files from the real filesystem
into the mocked filesystem.  Quite useful for fixing https://github.com/tschaub/mock-fs/issues/213
