FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:aac50ceef10391e78a899e3d2ccd00bbafa2dcb56ccf4586cbccf00edb84fc21 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:8c6edfb26c85153f236d26efebd9ad349aec403583f343f201ee67838b23658d AS build
WORKDIR /src
COPY ["KiNorge.Cms.csproj", "."]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build /app/publish .

# Umbraco creates /app/Views at startup and crashes if it is not allowed to.
RUN mkdir -p /app/umbraco/Data /app/umbraco/Logs /app/umbraco/mediacache /app/wwwroot/media /app/Views/Partials && \
    chown -R $APP_UID:$APP_UID /app/umbraco /app/uSync /app/wwwroot/media

USER $APP_UID

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080

CMD ["dotnet", "KiNorge.Cms.dll"]
