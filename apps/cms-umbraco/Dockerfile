FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:222759b391a1aaf241166672c8f99b2d4ada452e7b5319f3c6e8f265a37b5ad4 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:e70cdb7f80b0348f5cb85f19a8f670fca061f033d57eed12fa003d58b0e06317 AS build
WORKDIR /src
COPY ["KiNorge.Cms.csproj", "."]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .

# Umbraco lager /app/Views ved oppstart og krasjer hvis den ikke får lov.
RUN mkdir -p /app/umbraco/Data /app/umbraco/Logs /app/umbraco/mediacache /app/wwwroot/media /app/Views/Partials && \
    chown -R $APP_UID:$APP_UID /app/umbraco /app/uSync /app/wwwroot/media

USER $APP_UID

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080

CMD ["dotnet", "KiNorge.Cms.dll"]
