using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddOccurrenceListSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "OccurrenceLists",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Existing lists keep the alphabetical order they were shown in.
            migrationBuilder.Sql("""
                UPDATE OccurrenceLists SET SortOrder = (
                    SELECT COUNT(*) FROM OccurrenceLists o
                    WHERE o.UserId = OccurrenceLists.UserId AND lower(o.Name) < lower(OccurrenceLists.Name));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "OccurrenceLists");
        }
    }
}
