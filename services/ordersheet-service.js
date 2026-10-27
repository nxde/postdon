//const GoogleSheetService = require("./googlesheet-service");

//const gservice = new GoogleSheetService();

const workbookId = process.env.CHECKDON_WORKBOOK_ID;
const ordersheetName = "Đơn Hàng";
const HEADER_ROW=1;

class OrderSheetService {
    constructor({
        googleSheetService,
        productSheetService
    }) {
        this.googleSheetService = googleSheetService;
        //console.log("Constructor - G SHEET SERVICE: ",googleSheetService);
        this.productService = productSheetService;
    }

    // Tìm số dòng chứa key trong cột A.
    async findOrderRowByKey(key) {
        const rows = await this.googleSheetService.read(
            workbookId,
            `'${ordersheetName}'!A:A`
        );

        const targetKey = String(key).trim();
        const matches = [];

        // Bỏ qua dòng tiêu đề.
        // Mảng JavaScript bắt đầu từ 0, số dòng Sheets bắt đầu từ 1.
        for (let i = HEADER_ROW; i < rows.length; i++) {
            const currentKey = String(
                rows[i]?.[0] ?? ""
            ).trim();

            if (currentKey === targetKey) {
                matches.push(i + 1);
            }
        }

        if (matches.length > 1) {
            throw new Error(
                `Key "${targetKey}" xuất hiện ở nhiều dòng: ` +
                matches.join(", ")
            );
        }

        return matches.length === 1 ? matches[0] : null;
    }

    async postOrder(key, content) {
        //console.error("OrderSheetService.postOrder - googlesheetService: ");
        //console.error("2 OrderSheetService.postOrder - googlesheetService: ");
        const range = `'${ordersheetName}'!A:G`;

        if (typeof content !== "string" || !content.trim()) {
            return;
        }
        //console.error("3 OrderSheetService.postOrder - googlesheetService: ");
        const values = [[
            key,
            "",
            content,
            "",
            new Date().toLocaleString("sv-SE", {
                timeZone: "Asia/Ho_Chi_Minh"
            }),
            "",
            ""
        ]];
        //console.error("4 OrderSheetService.postOrder - googlesheetService: ");
        //console.log("Post order - G SHEET SERVICE: ",googleSheetService);
        //console.log("Post order - this G SHEET SERVICE: ",this.googleSheetService);
        await this.googleSheetService.append(workbookId, range, values);
    }

    
    // Cập nhật nội dung một đơn hàng đã tồn tại.
    async updateOrder(key, content) {
        if (key === null || key === undefined ||
            String(key).trim() === "") {
            throw new Error("order key không được để trống.");
        }

        if (typeof content !== "string" ||
            content.trim() === "") {
            return {
                updated: false,
                reason: "EMPTY_CONTENT"
            };
        }

        const rowNumber = await this.findOrderRowByKey(key);

        // Không tìm thấy thì tuyệt đối không append thành đơn mới.
        if (rowNumber === null) {
            return {
                updated: false,
                reason: "ORDER_NOT_FOUND",
                key
            };
        }

        // Chỉ sửa ô C, không đụng đến các cột khác.
        const range =
            `'${ordersheetName}'!C${rowNumber}`;
        //console.log(ordersheetName,"   ",range);

        await this.googleSheetService.write(
            workbookId,
            range,
            [[content]]
        );

        /*
        console.log(
            `Đã cập nhật đơn ${key} tại dòng ${rowNumber}`
        );
        */

        return {
            updated: true,
            key,
            rowNumber
        };
    }
}

module.exports = OrderSheetService;

