class ProductSheetService {
    constructor({ googleSheetService }) {
        this.googleSheetService = googleSheetService;
    }

    async getProducts() {
        return this.googleSheetService.read(
            process.env.CHECKDON_WORKBOOK_ID,
            "'Sản Phẩm'!A:F"
        );
    }
}

module.exports = ProductSheetService;