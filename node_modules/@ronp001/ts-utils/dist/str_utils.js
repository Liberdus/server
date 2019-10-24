"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class StrUtils {
    static canonize(str) {
        return str.replace(/_/g, '').replace(/-/g, '').replace(/\s/g, '').toLowerCase();
    }
    static isSimilar(str1, str2) {
        return StrUtils.canonize(str1) == StrUtils.canonize(str2);
    }
}
exports.StrUtils = StrUtils;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyX3V0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3N0cl91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLE1BQWEsUUFBUTtJQUNWLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBVTtRQUM3QixPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQTtJQUNqRixDQUFDO0lBQ00sTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFXLEVBQUUsSUFBVztRQUM1QyxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQTtJQUM3RCxDQUFDO0NBQ0o7QUFQRCw0QkFPQyJ9