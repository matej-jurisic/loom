using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddActivityShowAsOverdue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ShowAsOverdue",
                table: "Activities",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ShowAsOverdue",
                table: "Activities");
        }
    }
}
