import PDFDocument from "pdfkit";

export const CatalogGenerator = {
  /**
   * Generates a sleek, high-conversion auction layout directly to an in-memory buffer.
   * Completely bypasses physical disk writes to maximize execution speed.
   */
  async generateBrochureBuffer(bundle: {
    id: string;
    title: string;
    retailValue: number;
    bundlePrice: number;
    tierApplied: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // Header Accent Bar
      doc.rect(0, 0, 595, 15).fill("#ff4757");

      // Title Block
      doc
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(bundle.title, 40, 50, { width: 515 });

      // Horizontal Rule
      doc
        .moveTo(40, 110)
        .lineTo(555, 110)
        .strokeColor("#dddddd")
        .lineWidth(1)
        .stroke();

      // Bundle Layout Metadata
      doc
        .fillColor("#777777")
        .font("Helvetica")
        .fontSize(10)
        .text(`CATALOG ID: ${bundle.id.slice(0, 8).toUpperCase()}`, 40, 125);
      doc.text(`TIER TARGET: ${bundle.tierApplied.toUpperCase()}`, 250, 125);
      doc.text(`GENERATED VIA HBE ENGINE`, 430, 125);

      // Main Offer Card Block
      doc.rect(40, 160, 515, 140).fill("#f9f9f9");

      // Financial Anchoring Context
      doc
        .fillColor("#333333")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("EXCLUSIVE HIGH-VALUE OFFERING DETAIL", 60, 180);

      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#555555")
        .text(`Estimated Asset Valuation Market Value:`, 60, 210)
        .font("Helvetica-Bold")
        .fillColor("#ff4757")
        .text(`$${bundle.retailValue.toLocaleString()}`, 300, 210);

      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#555555")
        .text(`Ecosystem Holding Incentive Buy-Now Price:`, 60, 235)
        .font("Helvetica-Bold")
        .fillColor("#2ed573")
        .text(`$${bundle.bundlePrice.toLocaleString()}`, 300, 235);

      // Promotional Footer & Instructions
      doc.rect(40, 750, 515, 40).fill("#111111");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          "SCAN QR / HOVER WALLET TO EXECUTE INSTANT ONE-TAP TRANSFERS",
          70,
          765
        );

      doc.end();
    });
  },
};
