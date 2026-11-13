export interface RemittanceCalculation {
  foreignAmount: number; nrbBuyingRate: number; statutoryGrossNPR: number;
  actualCreditedNPR: number; bankRealizedRate: number; expectedTds5PctNPR: number;
  intermediaryFeeNPR: number; fxVarianceNPR: number; hasTdsDiscrepancy: boolean;
}
export function roundNpr(value: number): number {
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw new RangeError('Amount exceeds supported monetary precision.');
  return cents / 100;
}
export function calculateRemittanceStatutoryFigures(params: { foreignAmount: number; nrbBuyingRate: number; actualCreditedNPR: number; tdsWithheldNPR?: number; intermediaryFeeNPR?: number }): RemittanceCalculation {
  const { foreignAmount, nrbBuyingRate, actualCreditedNPR, intermediaryFeeNPR = 0 } = params;
  for (const n of [foreignAmount,nrbBuyingRate,actualCreditedNPR,intermediaryFeeNPR,params.tdsWithheldNPR ?? 0]) if (!Number.isFinite(n) || n < 0) throw new RangeError('Rates and amounts must be finite and non-negative.');
  if (foreignAmount === 0 || nrbBuyingRate === 0) throw new RangeError('Foreign amount and NRB buying rate must be positive.');
  const statutoryGrossNPR = roundNpr(foreignAmount * nrbBuyingRate);
  const expectedTds5PctNPR = Math.round(statutoryGrossNPR * 0.05);
  const withheld = params.tdsWithheldNPR ?? expectedTds5PctNPR;
  // Reconstruct gross so bank fees and withholding are not counted as FX losses.
  const fxVarianceNPR = roundNpr(actualCreditedNPR + withheld + intermediaryFeeNPR - statutoryGrossNPR);
  return { foreignAmount,nrbBuyingRate,statutoryGrossNPR,actualCreditedNPR,bankRealizedRate:actualCreditedNPR / foreignAmount,expectedTds5PctNPR,intermediaryFeeNPR,fxVarianceNPR,hasTdsDiscrepancy:params.tdsWithheldNPR !== undefined && roundNpr(withheld) !== expectedTds5PctNPR };
}
