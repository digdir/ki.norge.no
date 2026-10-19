namespace KiNorge.Cms.Malform;

public sealed record MalformSide(
    string Id,
    string Navn,
    string Url,
    string Innholdstype,
    int Tegn,
    string Malform,
    int NynorskTreff,
    int BokmalTreff,
    double Andel);

/// <param name="TegnTotalt">
/// The sum over classified pages. Pages with målform "ukjent" are kept out of both
/// numerator and denominator, so that a couple of short stubs do not move the percentage.
/// </param>
/// <param name="TegnSomMangler">
/// How many characters must move from bokmål to nynorsk to meet the requirement. 0 when the requirement is met.
/// </param>
public sealed record MalformRapport(
    double Kravet,
    int SiderTotalt,
    int SiderNynorsk,
    int SiderBokmal,
    int SiderUkjent,
    long TegnTotalt,
    long TegnNynorsk,
    double AndelTegn,
    double AndelSider,
    long TegnSomMangler,
    bool KravetErNadd,
    IReadOnlyList<MalformSide> Sider);
