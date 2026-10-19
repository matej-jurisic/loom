using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class AddGoalKindEndDateStyle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CalendarColorBy",
                table: "UserSettings",
                type: "TEXT",
                nullable: false,
                defaultValue: "category");

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "Goals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "EndDate",
                table: "Goals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Icon",
                table: "Goals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Goals",
                type: "TEXT",
                nullable: false,
                defaultValue: "goal");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CalendarColorBy",
                table: "UserSettings");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "EndDate",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "Icon",
                table: "Goals");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Goals");
        }
    }
}
