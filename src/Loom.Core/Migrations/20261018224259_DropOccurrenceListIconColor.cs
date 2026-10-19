using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class DropOccurrenceListIconColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Color",
                table: "OccurrenceLists");

            migrationBuilder.DropColumn(
                name: "Icon",
                table: "OccurrenceLists");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "OccurrenceLists",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Icon",
                table: "OccurrenceLists",
                type: "TEXT",
                nullable: true);
        }
    }
}
