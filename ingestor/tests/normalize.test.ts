import { describe, expect, it } from "vitest";
import { normalizeTreb, stableAddressHash } from "../src/core/normalize";

describe("normalize", () => {
  describe("stableAddressHash", () => {
    it("should generate consistent hash for same address", () => {
      const raw = {
        Address: {
          StreetNumber: "123",
          StreetName: "Main Street",
          City: "Toronto",
          PostalCode: "M5V 3A8",
        },
      };

      const hash1 = stableAddressHash(raw);
      const hash2 = stableAddressHash(raw);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(40); // SHA1 hex length
    });

    it("should generate different hash for different addresses", () => {
      const raw1 = {
        Address: {
          StreetNumber: "123",
          StreetName: "Main Street",
          City: "Toronto",
          PostalCode: "M5V 3A8",
        },
      };

      const raw2 = {
        Address: {
          StreetNumber: "456",
          StreetName: "Oak Avenue",
          City: "Toronto",
          PostalCode: "M5V 3A8",
        },
      };

      const hash1 = stableAddressHash(raw1);
      const hash2 = stableAddressHash(raw2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("normalizeTreb", () => {
    const mockRaw = {
      MlsNumber: "C5123456",
      Status: "A",
      ListDate: "2024-01-15T08:00:00Z",
      Updated: "2024-01-15T08:00:00Z",
      Address: {
        StreetNumber: "123",
        StreetName: "Main Street",
        City: "Toronto",
        PostalCode: "M5V 3A8",
      },
      Geo: {
        Latitude: 43.6426,
        Longitude: -79.3871,
      },
      PropertyType: "Condo Apartment",
      BedroomsTotal: 2,
      BathroomsTotalInteger: 2,
      LivingArea: 850,
      YearBuilt: 2018,
      ListPrice: 750000,
      TaxAnnualAmount: 4200,
      AssociationFee: 650,
      Media: [
        { MediaURL: "https://example.com/photo1.jpg" },
        { MediaURL: "https://example.com/photo2.jpg" },
      ],
      ListOffice: {
        Name: "Premium Realty Inc.",
        Phone: "416-555-0123",
      },
    };

    it("should normalize TRREB listing with all fields", () => {
      const result = normalizeTreb(mockRaw);

      expect(result).toEqual({
        id: "C5123456",
        mlsNumber: "C5123456",
        sourceBoard: "TRREB",
        status: "Active",
        listedAt: "2024-01-15T08:00:00Z",
        updatedAt: "2024-01-15T08:00:00Z",
        address: {
          street: "123 Main Street",
          city: "Toronto",
          province: "ON",
          postalCode: "M5V 3A8",
          lat: 43.6426,
          lng: -79.3871,
        },
        propertyType: "CondoApt",
        beds: 2,
        baths: 2,
        sqft: 850,
        yearBuilt: 2018,
        listPrice: 750000,
        taxesAnnual: 4200,
        condoFeeMonthly: 650,
        media: {
          photos: [
            "https://example.com/photo1.jpg",
            "https://example.com/photo2.jpg",
          ],
        },
        brokerage: {
          name: "Premium Realty Inc.",
          phone: "416-555-0123",
        },
        raw: mockRaw,
      });
    });

    it("should use address hash as ID when MLS number is missing", () => {
      const rawWithoutMls = { ...mockRaw };
      delete rawWithoutMls.MlsNumber;

      const result = normalizeTreb(rawWithoutMls);

      expect(result.id).not.toBe("C5123456");
      expect(result.id).toHaveLength(40); // SHA1 hash
      expect(result.mlsNumber).toBeUndefined();
    });

    it("should handle missing optional fields gracefully", () => {
      const minimalRaw = {
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: {
          City: "Toronto",
        },
        ListPrice: 500000,
      };

      const result = normalizeTreb(minimalRaw);

      expect(result.beds).toBe(0);
      expect(result.baths).toBe(0);
      expect(result.sqft).toBeUndefined();
      expect(result.yearBuilt).toBeUndefined();
      expect(result.taxesAnnual).toBeUndefined();
      expect(result.condoFeeMonthly).toBeUndefined();
      expect(result.media).toEqual({ photos: [] });
      expect(result.brokerage).toBeUndefined();
      expect(result.address.street).toBe("");
      expect(result.address.province).toBe("ON");
    });

    it("should map property types correctly", () => {
      const testCases = [
        { input: "Condo Apartment", expected: "CondoApt" },
        { input: "Detached", expected: "Detached" },
        { input: "Townhouse", expected: "Townhouse" },
        { input: "Semi-Detached", expected: "Semi" },
        { input: "Multiplex", expected: "Multiplex" },
        { input: "Unknown Type", expected: "Detached" },
        { input: "", expected: "CondoApt" },
        { input: undefined, expected: "CondoApt" },
      ];

      testCases.forEach(({ input, expected }) => {
        const raw = { ...mockRaw, PropertyType: input };
        const result = normalizeTreb(raw);
        expect(result.propertyType).toBe(expected);
      });
    });

    it("should map listing status correctly", () => {
      const testCases = [
        { input: "A", expected: "Active" },
        { input: "Sld", expected: "Sold" },
        { input: "Sus", expected: "Suspended" },
        { input: "Exp", expected: "Expired" },
        { input: "Unknown", expected: "Active" },
      ];

      testCases.forEach(({ input, expected }) => {
        const raw = { ...mockRaw, Status: input };
        const result = normalizeTreb(raw);
        expect(result.status).toBe(expected);
      });
    });

    it("should prefer AssociationFee over MaintenanceFee", () => {
      const rawWithBoth = {
        ...mockRaw,
        AssociationFee: 500,
        MaintenanceFee: 300,
      };

      const result = normalizeTreb(rawWithBoth);
      expect(result.condoFeeMonthly).toBe(500);
    });

    it("should use MaintenanceFee when AssociationFee is missing", () => {
      const rawWithMaintenance = {
        ...mockRaw,
        MaintenanceFee: 300,
      };
      delete rawWithMaintenance.AssociationFee;

      const result = normalizeTreb(rawWithMaintenance);
      expect(result.condoFeeMonthly).toBe(300);
    });
  });
});
