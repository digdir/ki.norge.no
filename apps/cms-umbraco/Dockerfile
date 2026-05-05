FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["apps/cms-umbraco/KiNorge.Cms.csproj", "apps/cms-umbraco/"]
COPY ["dotnet/Portals.Umbraco.Shared/Portals.Umbraco.Shared.csproj", "dotnet/Portals.Umbraco.Shared/"]
RUN dotnet restore "apps/cms-umbraco/KiNorge.Cms.csproj"
COPY . .
WORKDIR "/src/apps/cms-umbraco"
RUN dotnet build "KiNorge.Cms.csproj" -c  $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "KiNorge.Cms.csproj" -c  $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

ENTRYPOINT ["dotnet", "KiNorge.Cms.dll"]
