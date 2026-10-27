const { google } = require("googleapis");

// Dòng tiêu đề của sheet.
// insertRows() mặc định chèn từ HEADER_ROW + 1.
const HEADER_ROW = 1;

class GoogleSheetService {
    constructor() {
        const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY;

        if (!clientEmail || !privateKey) {
            throw new Error(
                "Thiếu GOOGLE_CLIENT_EMAIL hoặc GOOGLE_PRIVATE_KEY trong biến môi trường."
            );
        }

        this.auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey.replace(/\\n/g, "\n")
            },
            scopes: [
                "https://www.googleapis.com/auth/spreadsheets"
            ]
        });

        // Xếp hàng các thao tác ghi qua cùng một instance.
        this.writeQueue = Promise.resolve();

        // Cache Google Sheets API client.
        this.sheetsClientPromise = null;
    }

    // ==================================================
    // 1. QUẢN LÝ HÀNG ĐỢI GHI
    // ==================================================

    // Thực hiện tuần tự các thao tác ghi.
    // Nếu một thao tác lỗi, các thao tác tiếp theo vẫn chạy.
    enqueueWrite(operation) {
        const task = this.writeQueue.then(operation);

        this.writeQueue = task.catch(() => {});

        return task;
    }

    // ==================================================
    // 2. KẾT NỐI GOOGLE SHEETS API
    // ==================================================

    async getClient() {
        if (!this.sheetsClientPromise) {
            this.sheetsClientPromise = this.auth
                .getClient()
                .then(client =>
                    google.sheets({
                        version: "v4",
                        auth: client
                    })
                )
                .catch(error => {
                    this.sheetsClientPromise = null;
                    throw error;
                });
        }

        return this.sheetsClientPromise;
    }

    // ==================================================
    // 3. ĐỌC VÀ GHI DỮ LIỆU
    // ==================================================

    // Đọc dữ liệu trong một phạm vi A1 notation.
    async read(spreadsheetId, range) {
        const sheets = await this.getClient();

        const response =
            await sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });

        return response.data.values || [];
    }

    // Ghi dữ liệu vào một phạm vi cụ thể đã có.
    // values bắt buộc là mảng hai chiều.
    write(spreadsheetId, range, values) {
        return this.enqueueWrite(async () => {
            if (
                !Array.isArray(values) ||
                values.length === 0 ||
                values.some(row => !Array.isArray(row))
            ) {
                throw new Error(
                    "values phải là một mảng hai chiều không rỗng."
                );
            }

            const sheets = await this.getClient();

            const response =
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range,
                    valueInputOption: "USER_ENTERED",
                    requestBody: {
                        values
                    }
                });

            return response.data;
        });
    }

    // ==================================================
    // 4. PHÂN TÍCH PHẠM VI CỘT
    // ==================================================

    // Phân tích range dạng:
    // 'Đơn Hàng'!A:G
    // 'DanhMuc'!B:F
    parseColumnRange(range) {
        if (typeof range !== "string") {
            throw new Error(
                "range phải là chuỗi, ví dụ: 'Đơn Hàng'!A:G."
            );
        }

        const separatorIndex = range.lastIndexOf("!");

        if (separatorIndex < 1) {
            throw new Error(`Range không hợp lệ: ${range}`);
        }

        const sheetRef = range
            .slice(0, separatorIndex)
            .trim();

        const columnsRange = range
            .slice(separatorIndex + 1)
            .trim();

        const match =
            /^([A-Z]+):([A-Z]+)$/i.exec(columnsRange);

        if (!match) {
            throw new Error(
                `Phạm vi cột không hợp lệ: ${columnsRange}. ` +
                "Hãy dùng dạng A:G hoặc A:F."
            );
        }

        // Chuyển sheetRef thành tên thực của tab.
        let sheetName = sheetRef;

        if (
            sheetName.startsWith("'") &&
            sheetName.endsWith("'")
        ) {
            sheetName = sheetName
                .slice(1, -1)
                .replace(/''/g, "'");
        }

        const startColumn = match[1].toUpperCase();
        const endColumn = match[2].toUpperCase();

        const startColumnNumber =
            this.columnToNumber(startColumn);

        const endColumnNumber =
            this.columnToNumber(endColumn);

        if (startColumnNumber > endColumnNumber) {
            throw new Error(
                "Cột bắt đầu phải đứng trước hoặc bằng cột kết thúc."
            );
        }

        return {
            sheetRef,
            sheetName,
            startColumn,
            endColumn,
            startColumnNumber,
            endColumnNumber,
            columnCount:
                endColumnNumber - startColumnNumber + 1
        };
    }

    // Chuyển tên cột A, Z, AA... thành số.
    columnToNumber(column) {
        let number = 0;

        for (const char of column) {
            number =
                number * 26 +
                char.charCodeAt(0) - 64;
        }

        return number;
    }

    // ==================================================
    // 5. CHUẨN HÓA VÀ KIỂM TRA DỮ LIỆU
    // ==================================================

    // Chấp nhận:
    // Một hàng: ["DH001", "BS001", "Nội dung"]
    // Nhiều hàng: [["DH001", ...], ["DH002", ...]]
    //
    // Luôn trả về mảng hai chiều.
    normalizeRows(
        values,
        expectedColumnCount,
        parameterName = "values"
    ) {
        if (
            !Array.isArray(values) ||
            values.length === 0
        ) {
            throw new Error(
                `${parameterName} phải chứa ít nhất một hàng dữ liệu.`
            );
        }

        const rows = Array.isArray(values[0])
            ? values
            : [values];

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];

            if (!Array.isArray(row)) {
                throw new Error(
                    `Hàng dữ liệu thứ ${index + 1} không hợp lệ.`
                );
            }

            if (row.length !== expectedColumnCount) {
                throw new Error(
                    `Hàng ${index + 1} có ${row.length} cột, ` +
                    `nhưng range yêu cầu ${expectedColumnCount} cột.`
                );
            }
        }

        return rows;
    }

    // Một ô có dữ liệu thực sự hay không?
    //
    // null, undefined, "", "   ", chuỗi chỉ có tab/newline:
    // không có dữ liệu.
    //
    // Số 0 và boolean false:
    // vẫn được coi là dữ liệu.
    hasCellData(value) {
        if (value === null || value === undefined) {
            return false;
        }

        return String(value).trim().length > 0;
    }

    // ==================================================
    // 6. TÌM DÒNG CUỐI CÓ DỮ LIỆU
    // ==================================================

    // Chỉ xét các cột thuộc range.
    //
    // Ví dụ:
    // 'Đơn Hàng'!A:G
    //
    // Dữ liệu ngoài cột A:G không ảnh hưởng.
    // Trả về 0 nếu phạm vi không có dữ liệu.
    async findLastDataRow(spreadsheetId, range) {
        this.parseColumnRange(range);

        const rows = await this.read(
            spreadsheetId,
            range
        );

        let lastDataRow = 0;

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index] || [];

            const rowHasData = row.some(cell =>
                this.hasCellData(cell)
            );

            if (rowHasData) {
                // Mảng JS bắt đầu từ 0;
                // số dòng Google Sheets bắt đầu từ 1.
                lastDataRow = index + 1;
            }
        }

        return lastDataRow;
    }

    // ==================================================
    // 7. GHI DỮ LIỆU VÀO VỊ TRÍ CHỈ ĐỊNH
    // ==================================================

    // Hàm dùng chung cho append() và insertRows().
    async writeRowsAt(
        spreadsheetId,
        parsedRange,
        startRow,
        rows
    ) {
        const endRow =
            startRow + rows.length - 1;

        const targetRange =
            `${parsedRange.sheetRef}!` +
            `${parsedRange.startColumn}${startRow}:` +
            `${parsedRange.endColumn}${endRow}`;

        const sheets = await this.getClient();

        const response =
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: targetRange,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: rows
                }
            });

        console.log(
            `Đã ghi ${response.data.updatedRows ?? rows.length} dòng vào ` +
            `${response.data.updatedRange ?? targetRange}`
        );

        return response.data;
    }

    // ==================================================
    // 8. APPEND — GHI SAU DÒNG CUỐI CÓ DỮ LIỆU
    // ==================================================

    // Không chèn dịch hàng vật lý.
    // Tìm dòng cuối có dữ liệu trong phạm vi rồi ghi tiếp ở dòng dưới.
    //
    // values có thể là một hàng hoặc nhiều hàng.
    append(spreadsheetId, range, values) {
        return this.enqueueWrite(async () => {
            const parsedRange =
                this.parseColumnRange(range);

            const rows = this.normalizeRows(
                values,
                parsedRange.columnCount
            );

            const lastDataRow =
                await this.findLastDataRow(
                    spreadsheetId,
                    range
                );

            const firstWriteRow =
                lastDataRow + 1;

            return this.writeRowsAt(
                spreadsheetId,
                parsedRange,
                firstWriteRow,
                rows
            );
        });
    }

    // ==================================================
    // 9. TÌM SHEET ID THEO TÊN TAB
    // ==================================================

    async getSheetIdByName(
        spreadsheetId,
        sheetName
    ) {
        const sheets = await this.getClient();

        const response =
            await sheets.spreadsheets.get({
                spreadsheetId,
                fields: "sheets.properties(sheetId,title)"
            });

        const sheet = (
            response.data.sheets || []
        ).find(
            item => item.properties.title === sheetName
        );

        if (!sheet) {
            throw new Error(
                `Không tìm thấy sheet "${sheetName}".`
            );
        }

        return sheet.properties.sheetId;
    }

    // ==================================================
    // 10. INSERT ROWS — CHÈN CÁC HÀNG VẬT LÝ
    // ==================================================

    // Chèn một hoặc nhiều hàng tại vị trí startRow.
    //
    // Mặc định:
    // startRow = HEADER_ROW + 1.
    //
    // range ví dụ: 'Đơn Hàng'!A:F
    //
    // Lưu ý: thao tác chèn hàng áp dụng cho toàn sheet.
    // Những cột ngoài A:F cũng bị dịch xuống.
    insertRows(
        spreadsheetId,
        range,
        values,
        startRow = HEADER_ROW + 1
    ) {
        return this.enqueueWrite(async () => {
            if (
                !Number.isInteger(startRow) ||
                startRow < 1
            ) {
                throw new Error(
                    "startRow phải là số nguyên từ 1 trở lên."
                );
            }

            const parsedRange =
                this.parseColumnRange(range);

            const rows = this.normalizeRows(
                values,
                parsedRange.columnCount
            );

            const sheetId =
                await this.getSheetIdByName(
                    spreadsheetId,
                    parsedRange.sheetName
                );

            const sheets = await this.getClient();

            const numberOfRows = rows.length;

            // Google Sheets API dùng chỉ số bắt đầu từ 0.
            // endIndex không bao gồm chính nó.
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            insertDimension: {
                                range: {
                                    sheetId,
                                    dimension: "ROWS",
                                    startIndex: startRow - 1,
                                    endIndex:
                                        startRow - 1 + numberOfRows
                                },
                                inheritFromBefore: startRow > 1
                            }
                        }
                    ]
                }
            });

            // Ghi các hàng mới vào đúng cột trong range.
            return this.writeRowsAt(
                spreadsheetId,
                parsedRange,
                startRow,
                rows
            );
        });
    }
}

module.exports = GoogleSheetService;