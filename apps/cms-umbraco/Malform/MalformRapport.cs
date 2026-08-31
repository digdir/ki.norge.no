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
/// Summen over klassifiserte sider. Sider med målform "ukjent" holdes utenfor både
/// teller og nevner, slik at et par korte stubber ikke flytter prosenten.
/// </param>
/// <param name="TegnSomMangler">
/// Hvor mange tegn som må over fra bokmål til nynorsk for å nå kravet. 0 når kravet er nådd.
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
