"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const program = require("commander");
class CliApp {
    constructor() {
        this.program = program;
        this._did_exec_cmd = false;
    }
    // utility to generate action functions to be
    // called from commander
    action(func) {
        let newfunc = (...args) => {
            this._did_exec_cmd = true;
            this.beforeCommand.apply(this);
            func.apply(this, args);
            this.afterCommand.apply(this);
        };
        return newfunc;
    }
    // canonize the input received from commander's variadic args mechanism
    fix(arg1, arg2) {
        if (typeof arg1 != "undefined" && arg2 && arg2.length > 0) {
            return [arg1].concat(arg2);
        }
        else if (!!arg1) {
            return [arg1];
        }
        return [];
    }
    // override to get access to the args before any command is executed
    beforeCommand() { }
    afterCommand() { }
    main() {
        this._init();
        try {
            program.parse(process.argv);
            if (!this._did_exec_cmd) {
                program.help();
            }
        }
        catch (e) {
            if (program.verbose) {
                console.log(e);
            }
            else {
                console.log(e.message);
            }
        }
    }
}
exports.CliApp = CliApp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLWFwcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGktYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscUNBQW9DO0FBRXBDLE1BQXNCLE1BQU07SUFBNUI7UUFHYyxZQUFPLEdBQUcsT0FBTyxDQUFDO1FBRXBCLGtCQUFhLEdBQUcsS0FBSyxDQUFBO0lBNkNqQyxDQUFDO0lBM0NHLDZDQUE2QztJQUM3Qyx3QkFBd0I7SUFDZCxNQUFNLENBQUMsSUFBOEI7UUFDM0MsSUFBSSxPQUFPLEdBQUcsQ0FBQyxHQUFHLElBQVcsRUFBRSxFQUFFO1lBQzdCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFBO1lBQ3pCLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQzlCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFBO1lBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2pDLENBQUMsQ0FBQTtRQUNELE9BQU8sT0FBTyxDQUFBO0lBQ2xCLENBQUM7SUFFRCx1RUFBdUU7SUFDN0QsR0FBRyxDQUFDLElBQXdCLEVBQUUsSUFBMEI7UUFDOUQsSUFBSSxPQUFPLElBQUksSUFBSSxXQUFXLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQ3ZELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUE7U0FDN0I7YUFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7U0FDaEI7UUFDRCxPQUFPLEVBQUUsQ0FBQTtJQUNiLENBQUM7SUFFRCxvRUFBb0U7SUFDMUQsYUFBYSxLQUFLLENBQUM7SUFDbkIsWUFBWSxLQUFLLENBQUM7SUFFckIsSUFBSTtRQUVQLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUViLElBQUk7WUFDQSxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRTtnQkFDckIsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO2FBQ2pCO1NBQ0o7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNSLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRTtnQkFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTthQUNqQjtpQkFBTTtnQkFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQTthQUN6QjtTQUNKO0lBQ0wsQ0FBQztDQUNKO0FBbERELHdCQWtEQyJ9