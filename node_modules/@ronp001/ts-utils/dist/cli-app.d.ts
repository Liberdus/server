import * as program from 'commander';
export declare abstract class CliApp {
    protected abstract _init(): void;
    protected program: program.CommanderStatic;
    private _did_exec_cmd;
    protected action(func: (...args: any[]) => void): (...args: any[]) => void;
    protected fix(arg1: string | undefined, arg2: string[] | undefined): string[];
    protected beforeCommand(): void;
    protected afterCommand(): void;
    main(): void;
}
